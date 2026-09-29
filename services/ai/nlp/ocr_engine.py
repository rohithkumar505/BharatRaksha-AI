"""OCR engine — PDF text extraction with Tesseract fallback for scanned docs."""
import io
import re


def extract_text_from_bytes(content: bytes, mime_type: str | None, filename: str | None = None) -> str:
    mime = (mime_type or "").lower()
    name = (filename or "").lower()

    if mime == "application/pdf" or name.endswith(".pdf"):
        return _extract_pdf(content)
    if mime.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".webp", ".tiff")):
        return _extract_image(content)
    return content.decode("utf-8", errors="ignore")


def _extract_pdf(content: bytes) -> str:
    text_parts: list[str] = []

    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    text_parts.append(page_text)
    except Exception:
        pass

    combined = "\n".join(text_parts).strip()

    # Scanned PDF — little text extracted; use Tesseract on rendered pages
    if len(combined) < 50:
        try:
            import pytesseract
            from pdf2image import convert_from_bytes
            images = convert_from_bytes(content, dpi=200)
            for img in images:
                ocr_text = pytesseract.image_to_string(img, lang="eng+hin")
                if ocr_text.strip():
                    text_parts.append(ocr_text)
            combined = "\n".join(text_parts).strip()
        except Exception:
            pass

    if not combined:
        combined = content.decode("utf-8", errors="ignore")

    return _clean_text(combined)


def _extract_image(content: bytes) -> str:
    try:
        import pytesseract
        from PIL import Image, ImageFilter, ImageOps
        image = Image.open(io.BytesIO(content))
        image = ImageOps.grayscale(image)
        image = image.filter(ImageFilter.SHARPEN)
        text = pytesseract.image_to_string(image, lang="eng+hin")
        return _clean_text(text)
    except Exception:
        return content.decode("utf-8", errors="ignore")


def _clean_text(text: str) -> str:
    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
