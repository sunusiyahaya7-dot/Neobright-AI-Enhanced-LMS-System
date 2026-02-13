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
            
            with pdfplumber.open(io.BytesIO(file_content)) as pdf:
                pages_text = []
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        pages_text.append(page_text)
                text = "\n\n".join(pages_text)
                
            if text and text.strip():
                logger.info(f"pdfplumber extracted {len(text)} chars from PDF")
                return text.strip()
        except ImportError:
            logger.debug("pdfplumber not installed, trying PyPDF2")
        except Exception as e:
            logger.warning(f"pdfplumber failed: {e}, trying PyPDF2")
        
        # Method 2: PyPDF2 (fallback)
        try:
            import PyPDF2
            
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            pages_text = []
            
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    pages_text.append(page_text)
            
            text = "\n\n".join(pages_text)
            
            if text and text.strip():
                logger.info(f"PyPDF2 extracted {len(text)} chars from PDF")
                return text.strip()
        except ImportError:
            logger.warning("PyPDF2 not installed")
        except Exception as e:
            logger.error(f"PyPDF2 failed: {e}")
        
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
    def process_uploaded_file(file_content: bytes, filename: str, file_type: str) -> Optional[str]:
        """
        Process uploaded file and extract text content.
        Always returns something useful so the AI knows a file was uploaded.
        """
        try:
            logger.info(f"Processing file: {filename} ({file_type}, {len(file_content)} bytes)")
            
            if file_type == 'application/pdf':
                text = FileService.extract_text_from_pdf(file_content)
                if text:
                    return text
                return (
                    f"[PDF file '{filename}' was uploaded but text extraction failed. "
                    "The PDF may be scanned/image-based. "
                    "Ask the student to paste the key content or describe what is in the document.]"
                )
            
            elif file_type.startswith('image/'):
                return FileService.extract_text_from_image(file_content, file_type)
            
            else:
                logger.warning(f"Unsupported file type: {file_type}")
                return f"[File '{filename}' uploaded with unsupported type: {file_type}]"
                
        except Exception as e:
            logger.error(f"Error processing file {filename}: {e}")
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
