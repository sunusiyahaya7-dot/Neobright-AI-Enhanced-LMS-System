"""
File Processing Service for NeoBright LMS.
Handles extraction of text from uploaded files (PDFs, images).
"""
import io
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class FileService:
    """Service for processing uploaded files."""
    
    @staticmethod
    def extract_text_from_pdf(file_content: bytes) -> Optional[str]:
        """
        Extract text from PDF file using multiple extractors for reliability.
        Tries pdfplumber first (most robust), then PyPDF2 as fallback.
        """
        text = None
        
        # Method 1: pdfplumber (best for most PDFs including complex layouts)
        try:
            import pdfplumber
            
            pdf_stream = io.BytesIO(file_content)
            with pdfplumber.open(pdf_stream) as pdf:
                pages_text = []
                print(f"[PDF EXTRACT] pdfplumber opened PDF: {len(pdf.pages)} pages")
                for i, page in enumerate(pdf.pages):
                    page_text = page.extract_text()
                    if page_text:
                        pages_text.append(page_text)
                        print(f"[PDF EXTRACT] Page {i+1}: {len(page_text)} chars extracted")
                    else:
                        print(f"[PDF EXTRACT] Page {i+1}: NO text extracted")
                text = "\n\n".join(pages_text)
                
            if text and text.strip():
                print(f"[PDF EXTRACT] pdfplumber SUCCESS: {len(text)} total chars")
                logger.info(f"pdfplumber extracted {len(text)} chars from PDF")
                return text.strip()
            else:
                print(f"[PDF EXTRACT] pdfplumber: no text found across all pages")
        except ImportError:
            print("[PDF EXTRACT] pdfplumber not installed, trying PyPDF2")
            logger.debug("pdfplumber not installed, trying PyPDF2")
        except Exception as e:
            print(f"[PDF EXTRACT] pdfplumber EXCEPTION: {e}")
            logger.warning(f"pdfplumber failed: {e}, trying PyPDF2")
            import traceback
            traceback.print_exc()
        
        # Method 2: PyPDF2 (fallback)
        try:
            import PyPDF2
            
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            pages_text = []
            print(f"[PDF EXTRACT] PyPDF2 opened PDF: {len(pdf_reader.pages)} pages")
            
            for i, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                if page_text:
                    pages_text.append(page_text)
                    print(f"[PDF EXTRACT] PyPDF2 Page {i+1}: {len(page_text)} chars")
                else:
                    print(f"[PDF EXTRACT] PyPDF2 Page {i+1}: NO text")
            
            text = "\n\n".join(pages_text)
            
            if text and text.strip():
                print(f"[PDF EXTRACT] PyPDF2 SUCCESS: {len(text)} total chars")
                logger.info(f"PyPDF2 extracted {len(text)} chars from PDF")
                return text.strip()
            else:
                print(f"[PDF EXTRACT] PyPDF2: no text found either")
        except ImportError:
            print("[PDF EXTRACT] PyPDF2 not installed")
            logger.warning("PyPDF2 not installed")
        except Exception as e:
            print(f"[PDF EXTRACT] PyPDF2 EXCEPTION: {e}")
            logger.error(f"PyPDF2 failed: {e}")
        
        print("[PDF EXTRACT] ALL METHODS FAILED - returning None")
        logger.warning("All PDF extraction methods failed")
        return None
    
    @staticmethod
    def extract_text_from_image(file_content: bytes, file_type: str) -> Optional[str]:
        """
        Extract text from image using OCR if available.
        Falls back to indicating an image was uploaded.
        """
        try:
            import pytesseract
            from PIL import Image
            
            image = Image.open(io.BytesIO(file_content))
            text = pytesseract.image_to_string(image)
            
            if text and text.strip():
                return text.strip()
        except ImportError:
            logger.debug("pytesseract not available for OCR")
        except Exception as e:
            logger.debug(f"OCR failed: {e}")
        
        return "[Image uploaded. OCR not available - please describe the content you'd like help with.]"
    
    @staticmethod
    def _is_pdf(file_type: str, filename: str) -> bool:
        """Check if a file is a PDF by content type or extension."""
        file_type_lower = (file_type or "").lower().strip()
        filename_lower = (filename or "").lower()
        return (
            'pdf' in file_type_lower
            or filename_lower.endswith('.pdf')
        )

    @staticmethod
    def _is_image(file_type: str, filename: str) -> bool:
        """Check if a file is an image by content type or extension."""
        file_type_lower = (file_type or "").lower().strip()
        filename_lower = (filename or "").lower()
        image_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff')
        return (
            file_type_lower.startswith('image/')
            or any(filename_lower.endswith(ext) for ext in image_extensions)
        )

    @staticmethod
    def process_uploaded_file(file_content: bytes, filename: str, file_type: str) -> Optional[str]:
        """
        Process uploaded file and extract text content.
        Always returns something useful so the AI knows a file was uploaded.
        Uses flexible content-type matching (checks for 'pdf' substring, not exact match).
        """
        try:
            content_len = len(file_content) if file_content else 0
            header_hex = file_content[:8].hex() if file_content and len(file_content) >= 8 else "N/A"
            print(f"[FILE PROCESS] file={filename}, type={file_type}, size={content_len}, header={header_hex}")
            logger.info(f"Processing file: {filename} ({file_type}, {content_len} bytes, header={header_hex})")

            if content_len == 0:
                print("[FILE PROCESS] ERROR: file_content is empty (0 bytes)!")
                return f"[File '{filename}' was uploaded but contained 0 bytes. The upload may have failed.]"

            if FileService._is_pdf(file_type, filename):
                print(f"[FILE PROCESS] Detected as PDF, extracting text...")
                text = FileService.extract_text_from_pdf(file_content)
                if text:
                    print(f"[FILE PROCESS] PDF extraction SUCCESS: {len(text)} chars")
                    return text
                print(f"[FILE PROCESS] PDF extraction FAILED (returned None)")
                return (
                    f"[PDF file '{filename}' was uploaded but text extraction failed. "
                    "The PDF may be scanned/image-based. "
                    "Ask the student to paste the key content or describe what is in the document.]"
                )

            elif FileService._is_image(file_type, filename):
                print(f"[FILE PROCESS] Detected as image, extracting text...")
                return FileService.extract_text_from_image(file_content, file_type)

            else:
                print(f"[FILE PROCESS] Unsupported file type: {file_type}")
                logger.warning(f"Unsupported file type: {file_type}")
                return f"[File '{filename}' uploaded with unsupported type: {file_type}]"

        except Exception as e:
            print(f"[FILE PROCESS] EXCEPTION: {e}")
            logger.error(f"Error processing file {filename}: {e}")
            import traceback
            traceback.print_exc()
            return f"[Error processing file '{filename}': {str(e)}]"
    
    @staticmethod
    def create_file_context_message(filename: str, extracted_text: str) -> str:
        """
        Create a message that includes file content for AI context.
        """
        text_preview = extracted_text[:8000]
        if len(extracted_text) > 8000:
            text_preview += f"\n\n... [truncated, {len(extracted_text)} total characters]"
        
        return (
            f'The student uploaded a file called "{filename}". '
            f'Here is the extracted content:\n\n---\n{text_preview}\n---'
        )
    
    @staticmethod
    def create_display_message(filename: str, file_size: int) -> str:
        """
        Create a user-facing message to display in chat for file uploads.
        """
        if file_size >= 1024 * 1024:
            size_str = f"{file_size / (1024 * 1024):.1f}MB"
        else:
            size_str = f"{file_size / 1024:.1f}KB"
        
        return f"Uploaded: {filename} ({size_str})"
