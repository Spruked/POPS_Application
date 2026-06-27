from fastapi import APIRouter, File, UploadFile

router = APIRouter()


@router.post("/forensics/exif")
async def extract_exif(file: UploadFile = File(...)):
    return {"status": "unimplemented", "filename": file.filename}


@router.post("/forensics/gps")
async def extract_gps(file: UploadFile = File(...)):
    return {"status": "unimplemented", "filename": file.filename}


@router.post("/forensics/ocr")
async def run_ocr(file: UploadFile = File(...)):
    return {"status": "unimplemented", "filename": file.filename}
