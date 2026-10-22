//! Capture metadata (track C1, Android first). Architecture spec §2b.
//!
//! Records, per evidence original:
//! - **EXIF facts** exactly as found in the received bytes: capture time
//!   (`DateTimeOriginal`), its timezone offset (`OffsetTimeOriginal`) and GPS. Each fact
//!   has a status; absent, blank, incomplete or invalid values are recorded as such with
//!   their raw form, and **never** reconstructed, defaulted or "corrected".
//! - **Acquisition**: how the file reached Pops!, and whether the original camera bytes
//!   can be established on that path. On Android the WebView does not tell Pops! which
//!   component delivered a file, so no current path *establishes* camera bytes; the
//!   camera-intent path is recorded as *indicated* by facts Pops! holds.
//!
//! These are kept apart from Pops!'s own GPS observation (`evidence_metadata`) and from
//! the import time (`evidence.imported_at`). Parsing is read-only: received bytes are
//! never modified to insert or normalize metadata.

use serde::{Deserialize, Serialize};
use std::io::Cursor;

pub const EXTRACTOR: &str = "kamadak-exif 0.6.1";
/// The Android WebView file chooser whose behavior the acquisition rules describe.
pub const ANDROID_CHOOSER: &str = "wry 0.57.0 RustWebChromeClient";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifFacts {
    /// present | absent | unreadable | unsupported_format
    pub status: String,
    pub status_detail: Option<String>,
    /// `DateTimeOriginal` exactly as stored.
    pub capture_time_raw: Option<String>,
    /// `OffsetTimeOriginal` exactly as stored.
    pub capture_time_offset_raw: Option<String>,
    /// ISO 8601, derived only from a valid raw value; carries an offset only when the
    /// file recorded a valid one. Never filled in from another source.
    pub capture_time: Option<String>,
    /// present_with_offset | present_without_offset | blank | invalid | absent
    pub capture_time_status: String,
    /// present | absent | incomplete | invalid
    pub gps_status: String,
    pub gps_latitude: Option<f64>,
    pub gps_longitude: Option<f64>,
    /// GPS tags as found (rationals as "num/denom"), for every GPS status except absent.
    pub gps_raw: Option<serde_json::Value>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub software: Option<String>,
    /// `DateTime` (file change time) exactly as stored; a difference from the capture
    /// time can indicate later editing.
    pub modified_time_raw: Option<String>,
    /// Tags that are present but stored with a TIFF type other than the standard one,
    /// keyed by tag name, with the value as found. Such a tag is never treated as
    /// missing: the fact it carries is reported as invalid.
    pub unexpected_types: std::collections::BTreeMap<String, String>,
}

impl ExifFacts {
    fn none(status: &str, detail: Option<String>) -> Self {
        Self {
            status: status.into(),
            status_detail: detail,
            capture_time_raw: None,
            capture_time_offset_raw: None,
            capture_time: None,
            capture_time_status: "absent".into(),
            gps_status: "absent".into(),
            gps_latitude: None,
            gps_longitude: None,
            gps_raw: None,
            camera_make: None,
            camera_model: None,
            software: None,
            modified_time_raw: None,
            unexpected_types: Default::default(),
        }
    }
}

type Unexpected = std::collections::BTreeMap<String, String>;

/// An ASCII tag's value. A tag stored with another type is recorded in `unexpected`
/// (with its value as found) and yields None here.
fn ascii(exif: &exif::Exif, tag: exif::Tag, unexpected: &mut Unexpected) -> Option<String> {
    let field = exif.get_field(tag, exif::In::PRIMARY)?;
    match &field.value {
        exif::Value::Ascii(parts) => Some(parts.first().map(|p| String::from_utf8_lossy(p).to_string()).unwrap_or_default()),
        other => {
            unexpected.insert(tag.to_string(), format!("{other:?}"));
            None
        }
    }
}

/// A RATIONAL tag's values; other types are recorded in `unexpected`.
fn rationals(exif: &exif::Exif, tag: exif::Tag, unexpected: &mut Unexpected) -> Option<Vec<exif::Rational>> {
    let field = exif.get_field(tag, exif::In::PRIMARY)?;
    match &field.value {
        exif::Value::Rational(v) => Some(v.clone()),
        other => {
            unexpected.insert(tag.to_string(), format!("{other:?}"));
            None
        }
    }
}

fn rational_strings(v: &Option<Vec<exif::Rational>>) -> serde_json::Value {
    match v {
        Some(v) => serde_json::json!(v.iter().map(|r| format!("{}/{}", r.num, r.denom)).collect::<Vec<_>>()),
        None => serde_json::Value::Null,
    }
}

/// Degrees from a (deg, min, sec) triple. None if malformed (wrong count, zero denominator,
/// minutes or seconds out of range).
fn dms(v: &[exif::Rational]) -> Option<f64> {
    if v.len() != 3 || v.iter().any(|r| r.denom == 0) {
        return None;
    }
    let (d, m, s) = (v[0].to_f64(), v[1].to_f64(), v[2].to_f64());
    if !(0.0..60.0).contains(&m) || !(0.0..60.0).contains(&s) {
        return None;
    }
    Some(d + m / 60.0 + s / 3600.0)
}

/// Reads EXIF facts from received bytes without modifying them.
pub fn extract(bytes: &[u8]) -> ExifFacts {
    let exif = match exif::Reader::new().read_from_container(&mut Cursor::new(bytes)) {
        Ok(exif) => exif,
        Err(exif::Error::NotFound(detail)) => return ExifFacts::none("absent", Some(detail.into())),
        Err(exif::Error::InvalidFormat("Unknown image format")) => {
            return ExifFacts::none("unsupported_format", Some("not a JPEG, PNG, HEIF, WebP or TIFF image".into()))
        }
        Err(e) => return ExifFacts::none("unreadable", Some(e.to_string())),
    };

    let mut unexpected = Unexpected::new();
    let capture_time_raw = ascii(&exif, exif::Tag::DateTimeOriginal, &mut unexpected);
    let capture_time_offset_raw = ascii(&exif, exif::Tag::OffsetTimeOriginal, &mut unexpected);
    let capture_time_wrong_type = unexpected.contains_key(&exif::Tag::DateTimeOriginal.to_string());
    let (capture_time, capture_time_status) = match &capture_time_raw {
        // Present with a non-ASCII type: invalid, never absent.
        None if capture_time_wrong_type => (None, "invalid"),
        None => (None, "absent"),
        Some(raw) if raw.chars().all(|c| c == ' ' || c == ':') => (None, "blank"),
        Some(raw) => match chrono::NaiveDateTime::parse_from_str(raw, "%Y:%m:%d %H:%M:%S") {
            Err(_) => (None, "invalid"),
            Ok(naive) => match capture_time_offset_raw
                .as_deref()
                .and_then(|o| chrono::DateTime::parse_from_str(&format!("{raw} {o}"), "%Y:%m:%d %H:%M:%S %:z").ok())
            {
                Some(with_offset) => (Some(with_offset.to_rfc3339()), "present_with_offset"),
                // No valid offset recorded: keep local wall-clock time, never assume a zone.
                None => (Some(naive.format("%Y-%m-%dT%H:%M:%S").to_string()), "present_without_offset"),
            },
        },
    };

    let gps_tags = [exif::Tag::GPSLatitude, exif::Tag::GPSLatitudeRef, exif::Tag::GPSLongitude, exif::Tag::GPSLongitudeRef];
    let lat = rationals(&exif, exif::Tag::GPSLatitude, &mut unexpected);
    let lon = rationals(&exif, exif::Tag::GPSLongitude, &mut unexpected);
    let lat_ref = ascii(&exif, exif::Tag::GPSLatitudeRef, &mut unexpected);
    let lon_ref = ascii(&exif, exif::Tag::GPSLongitudeRef, &mut unexpected);
    let gps_wrong_type = gps_tags.iter().any(|t| unexpected.contains_key(&t.to_string()));
    let any_gps = gps_wrong_type || lat.is_some() || lon.is_some() || lat_ref.is_some() || lon_ref.is_some();
    // Each GPS tag as found: the standard value, or the wrongly typed value as found.
    let raw_of = |tag: exif::Tag, standard: serde_json::Value| match unexpected.get(&tag.to_string()) {
        Some(found) => serde_json::json!({ "unexpectedType": found }),
        None => standard,
    };
    let gps_raw = any_gps.then(|| {
        serde_json::json!({
            "latitude": raw_of(exif::Tag::GPSLatitude, rational_strings(&lat)),
            "latitudeRef": raw_of(exif::Tag::GPSLatitudeRef, serde_json::json!(lat_ref)),
            "longitude": raw_of(exif::Tag::GPSLongitude, rational_strings(&lon)),
            "longitudeRef": raw_of(exif::Tag::GPSLongitudeRef, serde_json::json!(lon_ref)),
        })
    });
    let (gps_status, gps_latitude, gps_longitude) = if !any_gps {
        ("absent", None, None)
    } else if gps_wrong_type {
        ("invalid", None, None)
    } else {
        match (&lat, &lat_ref, &lon, &lon_ref) {
            (Some(la), Some(lar), Some(lo), Some(lor)) => {
                let lat_sign = match lar.as_str() { "N" => Some(1.0), "S" => Some(-1.0), _ => None };
                let lon_sign = match lor.as_str() { "E" => Some(1.0), "W" => Some(-1.0), _ => None };
                match (dms(la), dms(lo), lat_sign, lon_sign) {
                    (Some(a), Some(o), Some(sa), Some(so)) if a <= 90.0 && o <= 180.0 => ("present", Some(a * sa), Some(o * so)),
                    _ => ("invalid", None, None),
                }
            }
            // A missing hemisphere or coordinate is never guessed.
            _ => ("incomplete", None, None),
        }
    };

    ExifFacts {
        status: "present".into(),
        status_detail: None,
        capture_time_raw,
        capture_time_offset_raw,
        capture_time,
        capture_time_status: capture_time_status.into(),
        gps_status: gps_status.into(),
        gps_latitude,
        gps_longitude,
        gps_raw,
        camera_make: ascii(&exif, exif::Tag::Make, &mut unexpected),
        camera_model: ascii(&exif, exif::Tag::Model, &mut unexpected),
        software: ascii(&exif, exif::Tag::Software, &mut unexpected),
        modified_time_raw: ascii(&exif, exif::Tag::DateTime, &mut unexpected),
        unexpected_types: unexpected,
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Acquisition {
    /// What the app asked for: camera | photo_library | file
    pub requested_source: String,
    pub platform: String,
    pub acquisition_path: String,
    /// established | indicated | not_established | unknown
    ///
    /// `established` is reserved for a path where the platform itself reports which
    /// component delivered the file; no current path does. `indicated`: the facts Pops!
    /// holds match its own camera-intent file, but the delivering component is not proven.
    pub original_camera_bytes: String,
    pub basis: String,
    /// Whether the platform may have removed location metadata before Pops! received the file.
    pub location_may_be_redacted: bool,
}

/// `JPEG_yyyyMMdd_HHmmss_<digits>.jpg`: the file the Android camera intent writes into
/// Pops!' own storage (wry `createImageFile` + `File.createTempFile`).
pub fn is_android_capture_file_name(name: &str) -> bool {
    let Some(rest) = name.strip_prefix("JPEG_").and_then(|r| r.strip_suffix(".jpg")) else { return false };
    let parts: Vec<&str> = rest.split('_').collect();
    parts.len() == 3
        && parts[0].len() == 8
        && parts[1].len() == 6
        && !parts[2].is_empty()
        && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
}

/// How far before recording a camera-intent file may have been created and still be
/// this capture's file (wry names it when the camera opens), and how far after (clock
/// granularity).
pub const CAMERA_FILE_MAX_AGE_MINUTES: i64 = 15;
pub const CAMERA_FILE_MAX_AHEAD_MINUTES: i64 = 1;

/// The local time in a camera-intent file name (`JPEG_yyyyMMdd_HHmmss_...`), written by
/// wry with the device's local clock and zone.
pub fn android_capture_file_time(name: &str) -> Option<chrono::NaiveDateTime> {
    if !is_android_capture_file_name(name) {
        return None;
    }
    chrono::NaiveDateTime::parse_from_str(&name[5..20], "%Y%m%d_%H%M%S").ok()
}

/// Classifies how a file reached Pops!. `platform` comes from the running build
/// (`std::env::consts::OS`); `received_file_name` from the stored evidence record;
/// `recorded_at_local` is this device's local clock when the metadata is recorded,
/// which happens right after sealing.
pub fn classify(
    requested_source: &str,
    platform: &str,
    received_file_name: Option<&str>,
    recorded_at_local: chrono::NaiveDateTime,
) -> Result<Acquisition, String> {
    if !["camera", "photo_library", "file"].contains(&requested_source) {
        return Err(format!("Unknown acquisition source '{requested_source}'"));
    }
    let make = |path: &str, original: &str, basis: String, redacted: bool| Acquisition {
        requested_source: requested_source.into(),
        platform: platform.into(),
        acquisition_path: path.into(),
        original_camera_bytes: original.into(),
        basis,
        location_may_be_redacted: redacted,
    };
    let camera_file_time = received_file_name.and_then(android_capture_file_time);
    let fresh = camera_file_time.is_some_and(|t| {
        let age = recorded_at_local - t;
        age <= chrono::Duration::minutes(CAMERA_FILE_MAX_AGE_MINUTES) && age >= -chrono::Duration::minutes(CAMERA_FILE_MAX_AHEAD_MINUTES)
    });
    Ok(match (platform, requested_source) {
        ("android", "camera") if fresh => make(
            "android_camera_capture_intent",
            "indicated",
            format!("A camera capture was requested, and the received file has the name and creation time of the file Pops! asks the camera app to write (ACTION_IMAGE_CAPTURE with EXTRA_OUTPUT, {ANDROID_CHOOSER}), created within {CAMERA_FILE_MAX_AGE_MINUTES} minutes before this record. The WebView does not report which component delivered the file, and other camera apps use the same naming, so the camera app's original bytes are indicated, not established. Whether the camera recorded location depends on its own settings."),
            false,
        ),
        ("android", "camera") if camera_file_time.is_some() => make(
            "android_camera_requested_picker_fallback",
            "not_established",
            format!("A camera capture was requested. The received file is named like a camera-intent file, but its time does not match this capture, so it may be an earlier photo chosen through the file picker that {ANDROID_CHOOSER} falls back to. That picker may deliver a modified copy."),
            true,
        ),
        ("android", "camera") => make(
            "android_camera_requested_picker_fallback",
            "not_established",
            format!("A camera capture was requested, but the received file is not the capture file Pops! created. {ANDROID_CHOOSER} falls back to the system file picker when no camera app is available, and that picker may deliver a modified copy."),
            true,
        ),
        ("android", _) => make(
            "android_content_picker",
            "not_established",
            format!("Chosen through the Android system picker (ACTION_GET_CONTENT, {ANDROID_CHOOSER}). Android may hand apps a copy with location metadata removed, so the device's original file can't be established."),
            true,
        ),
        ("ios", _) => make(
            "ios_file_chooser",
            "unknown",
            "iOS acquisition paths are not characterized yet; they are planned with the iOS release.".into(),
            true,
        ),
        _ => make(
            "desktop_file_selection",
            "not_established",
            "Selected from this computer's files. The file is preserved exactly as read from disk; its history before that is unknown.".into(),
            false,
        ),
    })
}

#[cfg(test)]
pub mod test_images {
    //! Builds real EXIF blocks for tests (kamadak-exif's experimental writer).
    use exif::experimental::Writer;
    use exif::{Field, In, Rational, Tag, Value};
    use std::io::Cursor;

    pub fn exif_ascii(tag: Tag, s: &str) -> Field {
        Field { tag, ifd_num: In::PRIMARY, value: Value::Ascii(vec![s.as_bytes().to_vec()]) }
    }

    pub fn exif_dms(tag: Tag, d: u32, m: u32, s_hundredths: u32) -> Field {
        Field {
            tag,
            ifd_num: In::PRIMARY,
            value: Value::Rational(vec![
                Rational { num: d, denom: 1 },
                Rational { num: m, denom: 1 },
                Rational { num: s_hundredths, denom: 100 },
            ]),
        }
    }

    /// A minimal JPEG: SOI, APP1 "Exif" with the given fields, EOI.
    pub fn jpeg_with(fields: &[Field]) -> Vec<u8> {
        let mut writer = Writer::new();
        for f in fields {
            writer.push_field(f);
        }
        let mut tiff = Cursor::new(Vec::new());
        writer.write(&mut tiff, false).unwrap();
        let tiff = tiff.into_inner();
        let mut out = vec![0xFF, 0xD8, 0xFF, 0xE1];
        out.extend_from_slice(&((2 + 6 + tiff.len()) as u16).to_be_bytes());
        out.extend_from_slice(b"Exif\0\0");
        out.extend_from_slice(&tiff);
        out.extend_from_slice(&[0xFF, 0xD9]);
        out
    }

    /// A minimal JPEG with a JFIF header and no EXIF at all.
    pub fn jpeg_without_exif() -> Vec<u8> {
        vec![
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, b'J', b'F', b'I', b'F', 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
            0x00, 0x00, 0xFF, 0xD9,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::test_images::*;
    use super::*;
    use exif::Tag;

    fn full_capture() -> Vec<u8> {
        jpeg_with(&[
            exif_ascii(Tag::Make, "Google"),
            exif_ascii(Tag::Model, "Pixel 7"),
            exif_ascii(Tag::DateTime, "2026:10:21 16:32:00"),
            exif_ascii(Tag::DateTimeOriginal, "2026:10:21 16:32:00"),
            exif_ascii(Tag::OffsetTimeOriginal, "-05:00"),
            exif_dms(Tag::GPSLatitude, 37, 5, 1512),
            exif_ascii(Tag::GPSLatitudeRef, "N"),
            exif_dms(Tag::GPSLongitude, 94, 30, 4788),
            exif_ascii(Tag::GPSLongitudeRef, "W"),
        ])
    }

    #[test]
    fn full_exif_is_read_with_offset_and_signed_coordinates() {
        let facts = extract(&full_capture());
        assert_eq!(facts.status, "present");
        assert_eq!(facts.capture_time_raw.as_deref(), Some("2026:10:21 16:32:00"));
        assert_eq!(facts.capture_time_offset_raw.as_deref(), Some("-05:00"));
        assert_eq!(facts.capture_time.as_deref(), Some("2026-10-21T16:32:00-05:00"));
        assert_eq!(facts.capture_time_status, "present_with_offset");
        assert_eq!(facts.gps_status, "present");
        assert!((facts.gps_latitude.unwrap() - 37.0875333).abs() < 1e-6, "{:?}", facts.gps_latitude);
        assert!((facts.gps_longitude.unwrap() + 94.5133).abs() < 1e-6, "{:?}", facts.gps_longitude);
        assert_eq!((facts.camera_make.as_deref(), facts.camera_model.as_deref()), (Some("Google"), Some("Pixel 7")));
    }

    #[test]
    fn missing_exif_is_recorded_as_absent() {
        let bytes = jpeg_without_exif();
        let facts = extract(&bytes);
        assert_eq!(facts.status, "absent");
        assert_eq!((facts.capture_time_status.as_str(), facts.gps_status.as_str()), ("absent", "absent"));
        assert_eq!((facts.capture_time, facts.gps_latitude, facts.camera_make), (None, None, None));
        assert_eq!(extract(b"%PDF-1.7 not an image").status, "unsupported_format");
    }

    #[test]
    fn capture_time_without_offset_is_not_assigned_a_zone() {
        let facts = extract(&jpeg_with(&[exif_ascii(Tag::DateTimeOriginal, "2026:10:21 16:32:00")]));
        assert_eq!(facts.capture_time.as_deref(), Some("2026-10-21T16:32:00"));
        assert_eq!(facts.capture_time_status, "present_without_offset");
        assert_eq!(facts.capture_time_offset_raw, None);
    }

    #[test]
    fn stripped_gps_stays_absent_and_is_not_reconstructed() {
        // As a picker delivers it: capture time kept, every GPS tag removed.
        let facts = extract(&jpeg_with(&[
            exif_ascii(Tag::DateTimeOriginal, "2026:10:21 16:32:00"),
            exif_ascii(Tag::OffsetTimeOriginal, "-05:00"),
            exif_ascii(Tag::Model, "Pixel 7"),
        ]));
        assert_eq!(facts.gps_status, "absent");
        assert_eq!((facts.gps_latitude, facts.gps_longitude, facts.gps_raw), (None, None, None));
        assert_eq!(facts.capture_time_status, "present_with_offset");
    }

    #[test]
    fn altered_or_invalid_exif_is_kept_raw_and_never_corrected() {
        let facts = extract(&jpeg_with(&[
            exif_ascii(Tag::DateTimeOriginal, "2026:13:45 99:00:00"),
            exif_ascii(Tag::OffsetTimeOriginal, "+99:99"),
            exif_ascii(Tag::Software, "Adobe Photoshop 25.0"),
            exif_ascii(Tag::DateTime, "2026:10:30 09:00:00"),
            exif_dms(Tag::GPSLatitude, 95, 0, 0),
            exif_ascii(Tag::GPSLatitudeRef, "N"),
            exif_dms(Tag::GPSLongitude, 94, 30, 4788),
            exif_ascii(Tag::GPSLongitudeRef, "W"),
        ]));
        assert_eq!(facts.capture_time_raw.as_deref(), Some("2026:13:45 99:00:00"));
        assert_eq!((facts.capture_time.as_deref(), facts.capture_time_status.as_str()), (None, "invalid"));
        assert_eq!(facts.gps_status, "invalid");
        assert_eq!((facts.gps_latitude, facts.gps_longitude), (None, None));
        assert_eq!(facts.gps_raw.as_ref().unwrap()["latitude"][0], "95/1");
        assert_eq!(facts.software.as_deref(), Some("Adobe Photoshop 25.0"));
        assert_eq!(facts.modified_time_raw.as_deref(), Some("2026:10:30 09:00:00"));
    }

    #[test]
    fn wrongly_typed_tags_are_invalid_not_missing() {
        use exif::{Field, In, Value};
        // DateTimeOriginal stored as BYTE, GPSLatitude stored as ASCII, Make as SHORT.
        let facts = extract(&jpeg_with(&[
            Field { tag: Tag::DateTimeOriginal, ifd_num: In::PRIMARY, value: Value::Byte(vec![0x32, 0x30]) },
            exif_ascii(Tag::GPSLatitude, "37 5 15.12"),
            Field { tag: Tag::Make, ifd_num: In::PRIMARY, value: Value::Short(vec![7]) },
        ]));
        assert_eq!(facts.status, "present");
        assert_eq!((facts.capture_time_status.as_str(), facts.capture_time.as_deref()), ("invalid", None));
        assert_eq!(facts.gps_status, "invalid");
        assert_eq!((facts.gps_latitude, facts.gps_longitude), (None, None));
        let raw = facts.gps_raw.as_ref().unwrap();
        assert!(raw["latitude"]["unexpectedType"].as_str().unwrap().contains("Ascii"), "{raw}");
        assert_eq!(facts.camera_make, None);
        assert!(facts.unexpected_types["DateTimeOriginal"].contains("Byte"), "{:?}", facts.unexpected_types);
        assert!(facts.unexpected_types["GPSLatitude"].contains("Ascii"));
        assert!(facts.unexpected_types["Make"].contains("Short"));
        // Standard types produce no entries.
        assert!(extract(&full_capture()).unexpected_types.is_empty());
    }

    #[test]
    fn missing_hemisphere_is_incomplete_not_guessed() {
        let facts = extract(&jpeg_with(&[exif_dms(Tag::GPSLatitude, 37, 5, 1512), exif_dms(Tag::GPSLongitude, 94, 30, 4788)]));
        assert_eq!((facts.gps_status.as_str(), facts.gps_latitude), ("incomplete", None));
    }

    #[test]
    fn blank_capture_time_is_recorded_as_blank() {
        let facts = extract(&jpeg_with(&[exif_ascii(Tag::DateTimeOriginal, "    :  :     :  :  ")]));
        assert_eq!((facts.capture_time_status.as_str(), facts.capture_time), ("blank", None));
    }

    #[test]
    fn extraction_never_modifies_the_bytes() {
        let bytes = full_capture();
        let before = bytes.clone();
        let _ = extract(&bytes);
        assert_eq!(bytes, before);
    }

    #[test]
    fn acquisition_paths_are_classified_from_facts_pops_holds() {
        let at = |t: &str| chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%d %H:%M:%S").unwrap();
        let now = at("2026-10-21 16:35:00");
        let cam = classify("camera", "android", Some("JPEG_20261021_163200_8421390.jpg"), now).unwrap();
        assert_eq!((cam.acquisition_path.as_str(), cam.original_camera_bytes.as_str(), cam.location_may_be_redacted), ("android_camera_capture_intent", "indicated", false));
        // Same naming, but an earlier photo (e.g. picked through the fallback picker).
        let old = classify("camera", "android", Some("JPEG_20261020_090000_1234.jpg"), now).unwrap();
        assert_eq!((old.acquisition_path.as_str(), old.original_camera_bytes.as_str(), old.location_may_be_redacted), ("android_camera_requested_picker_fallback", "not_established", true));
        let ahead = classify("camera", "android", Some("JPEG_20261021_164000_1.jpg"), now).unwrap();
        assert_eq!(ahead.original_camera_bytes, "not_established");
        let edge = classify("camera", "android", Some("JPEG_20261021_162000_1.jpg"), now).unwrap();
        assert_eq!(edge.original_camera_bytes, "indicated");
        let fallback = classify("camera", "android", Some("PXL_20261021_163200.jpg"), now).unwrap();
        assert_eq!((fallback.acquisition_path.as_str(), fallback.original_camera_bytes.as_str()), ("android_camera_requested_picker_fallback", "not_established"));
        let picked = classify("photo_library", "android", Some("JPEG_20261021_163200_8421390.jpg"), now).unwrap();
        assert_eq!((picked.acquisition_path.as_str(), picked.original_camera_bytes.as_str(), picked.location_may_be_redacted), ("android_content_picker", "not_established", true));
        let desktop = classify("file", "windows", Some("IMG_0001.jpg"), now).unwrap();
        assert_eq!((desktop.acquisition_path.as_str(), desktop.original_camera_bytes.as_str()), ("desktop_file_selection", "not_established"));
        assert_eq!(classify("file", "ios", None, now).unwrap().original_camera_bytes, "unknown");
        assert!(classify("screenshot", "android", None, now).is_err());
        // No path claims established camera bytes today.
        for (src, os, name) in [("camera", "android", Some("JPEG_20261021_163200_1.jpg")), ("photo_library", "android", None), ("file", "windows", None), ("camera", "ios", None)] {
            assert_ne!(classify(src, os, name, now).unwrap().original_camera_bytes, "established");
        }
        assert!(!is_android_capture_file_name("JPEG_2026102_163200_1.jpg"));
        assert!(!is_android_capture_file_name("JPEG_20261021_163200_.jpg"));
    }

    /// The camera-path rules describe wry's Android chooser. If wry changes, this fails
    /// so the classification is re-verified against the new source before release.
    #[test]
    fn android_chooser_version_matches_the_classified_behavior() {
        let lock = include_str!("../Cargo.lock");
        let wry = lock.split("[[package]]").find(|p| p.contains("name = \"wry\"")).expect("wry in Cargo.lock");
        assert!(wry.contains("version = \"0.57.0\""), "wry changed; re-verify capture_metadata::classify against its RustWebChromeClient.kt");
    }
}
