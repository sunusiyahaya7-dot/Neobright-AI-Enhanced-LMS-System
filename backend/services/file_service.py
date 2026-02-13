"""
File Processing Service for NeoBright LMS.
Handles extraction of text from uploaded files (PDFs, images).
"""
import io
import base64
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class FileService:
    """Service for processing uploaded files."""
    
    @staticmethod
    def extract_text_from_pdf(file_content: bytes) -> Optional[str]:
        """
        Extract text from PDF file.
        
        Args:
            file_content: PDF file bytes
            
        Returns:
            Extracted text or None if extraction fails
        """
        try:
            import PyPDF2
            
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            text = ""
            
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text += page.extract_text()
            
            return text.strip() if text.strip() else None
        except ImportError:
            logger.warning("PyPDF2 not installed, unable to process PDF files")
            return None
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {e}")
            return None
    
    @staticmethod
    def extract_text_from_image(file_content: bytes, file_type: str) -> Optional[str]:
        """
        Extract text from image using OCR (Tesseract or similar).
        Falls back to returning image metadata if OCR unavailable.
        
        Args:
            file_content: Image file bytes
            file_type: MIME type (e.g., 'image/png', 'image/jpeg')
            
        Returns:
            Extracted text or None if extraction fails
        """
        try:
            # Try to use pytesseract for OCR
            try:
                import pytesseract
                from PIL import Image
                
                image = Image.open(io.BytesIO(file_content))
                text = pytesseract.image_to_string(image)
                
                if text.strip():
                    return text.strip()
            except (ImportError, Exception) as e:
                logger.debug(f"OCR unavailable or failed: {e}")
                # Fallback: just indicate that an image was uploaded
                return f"[Image file uploaded: {file_type}] (Note: Image OCR not available, please describe your lecture content)"
        except Exception as e:
            logger.error(f"Error processing image: {e}")
            return None
    
    @staticmethod
    def process_uploaded_file(file_content: bytes, filename: str, file_type: str) -> Optional[str]:
        """
        Process uploaded file and extract text content.
        
        Args:
            file_content: File bytes
            filename: Original filename
            file_type: MIME type
            
        Returns:
            Extracted text content or None if processing fails
        """
        try:
            if file_type == 'application/pdf':
                text = FileService.extract_text_from_pdf(file_content)
            elif file_type.startswith('image/'):
                text = FileService.extract_text_from_image(file_content, file_type)
            else:
                logger.warning(f"Unsupported file type: {file_type}")
                return None
            
            if text:
                return text
            else:
                return f"[File uploaded: {filename}] (Note: Could not extract text from file)"
        except Exception as e:
            logger.error(f"Error processing file {filename}: {e}")
            return None
    
    @staticmethod
    def create_file_context_message(filename: str, extracted_text: str) -> str:
        """
        Create a message that includes file content for AI context.
        
        Args:
            filename: Original filename
            extracted_text: Extracted text from file
            
        Returns:
            Formatted message with file context (for internal use)
        """
        # Limit extracted text to first 5000 characters to avoid token overflow
        text_preview = extracted_text[:5000]
        if len(extracted_text) > 5000:
            text_preview += "\n... [text truncated]"
        
        return f"[File uploaded: **{filename}**]\n\n```\n{text_preview}\n```"
    
    @staticmethod
    def create_display_message(filename: str, file_size: int) -> str:
        """
        Create a message to display in chat for file uploads.
        
        Args:
            filename: Original filename
            file_size: File size in bytes
            
        Returns:
            Formatted message for chat display
        """
        size_mb = file_size / (1024 * 1024)
        return f"📎 Uploaded: **{filename}** ({size_mb:.1f}MB)"
