import React, { useState, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Upload, Download, ChevronLeft, ChevronRight, Image as ImageIcon, FileText, Trash2 } from 'lucide-react';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  
  const [pdfDocProxy, setPdfDocProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
  const [renderScale, setRenderScale] = useState(1);
  const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 });
  
  const [imagePos, setImagePos] = useState({ x: 50, y: 50, width: 150, height: 150 });
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'jpg' | 'png'>('pdf');

  // Handle PDF Upload
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
    } else {
      alert('Please select a valid PDF file.');
    }
  };

  // Handle Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreviewUrl(url);
      
      // Reset image position when new image is uploaded
      setImagePos({ x: 50, y: 50, width: 150, height: 150 });
    } else {
      alert('Please select a valid image file.');
    }
  };

  // Load PDF Document
  useEffect(() => {
    if (!pdfFile) {
      setPdfDocProxy(null);
      setNumPages(0);
      setCurrentPage(1);
      return;
    }
    
    let isMounted = true;
    const loadPdf = async () => {
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        if (isMounted) {
          setPdfDocProxy(doc);
          setNumPages(doc.numPages);
          setCurrentPage(1);
        }
      } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Failed to load PDF file.');
      }
    };
    loadPdf();
    
    return () => {
      isMounted = false;
    };
  }, [pdfFile]);

  // Render PDF Page
  useEffect(() => {
    if (!pdfDocProxy || !canvasRef.current || !containerRef.current) return;
    
    let isMounted = true;
    let renderTask: pdfjsLib.RenderTask | null = null;
    
    const renderPage = async () => {
      try {
        const page = await pdfDocProxy.getPage(currentPage);
        const unscaledViewport = page.getViewport({ scale: 1 });
        
        if (isMounted) {
          setOriginalDimensions({ width: unscaledViewport.width, height: unscaledViewport.height });
        }
        
        const containerWidth = containerRef.current?.clientWidth || 800;
        const containerHeight = containerRef.current?.clientHeight || 600;
        
        // Add some padding
        const padding = 40;
        const availableWidth = containerWidth - padding;
        const availableHeight = containerHeight - padding;
        
        const scale = Math.min(
          availableWidth / unscaledViewport.width,
          availableHeight / unscaledViewport.height
        );
        
        if (isMounted) {
          setRenderScale(scale);
        }
        
        const viewport = page.getViewport({ scale });
        
        if (isMounted) {
          setPageDimensions({ width: viewport.width, height: viewport.height });
        }
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const context = canvas.getContext('2d');
        if (!context) return;
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };
        
        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (error: any) {
        if (error.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', error);
        }
      }
    };
    
    renderPage();
    
    return () => {
      isMounted = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDocProxy, currentPage]);

  // Handle Export
  const handleExport = async () => {
    if (!pdfFile || !imageFile || !imagePreviewUrl || !canvasRef.current) return;
    
    setIsExporting(true);
    try {
      if (exportFormat === 'pdf') {
        // Load the PDF with pdf-lib
        const pdfBytes = await pdfFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        
        // Load the image with pdf-lib
        const imageBytes = await imageFile.arrayBuffer();
        let pdfImage;
        if (imageFile.type === 'image/png') {
          pdfImage = await pdfDoc.embedPng(imageBytes);
        } else if (imageFile.type === 'image/jpeg' || imageFile.type === 'image/jpg') {
          pdfImage = await pdfDoc.embedJpg(imageBytes);
        } else {
          throw new Error('Unsupported image format. Please use PNG or JPEG.');
        }
        
        // Get the target page (0-indexed in pdf-lib)
        const pages = pdfDoc.getPages();
        const page = pages[currentPage - 1];
        
        // Calculate coordinates and dimensions
        // pdf-lib's coordinate system has origin at bottom-left
        // Our UI has origin at top-left
        
        // 1. Convert UI dimensions to original PDF dimensions
        const originalWidth = imagePos.width / renderScale;
        const originalHeight = imagePos.height / renderScale;
        const originalX = imagePos.x / renderScale;
        const originalY = imagePos.y / renderScale;
        
        // 2. Convert Y coordinate to bottom-left origin
        const pdfY = page.getHeight() - originalY - originalHeight;
        
        // Draw the image
        page.drawImage(pdfImage, {
          x: originalX,
          y: pdfY,
          width: originalWidth,
          height: originalHeight,
        });
        
        // Save and download
        const modifiedPdfBytes = await pdfDoc.save();
        const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `modified_${pdfFile.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        // Export as Image (JPG or PNG)
        // We need to draw the PDF canvas and the image onto a new canvas
        const exportCanvas = document.createElement('canvas');
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');

        // Set dimensions to match the original PDF page size
        exportCanvas.width = originalDimensions.width;
        exportCanvas.height = originalDimensions.height;

        // 1. Draw the PDF page
        // We need to re-render the page at scale 1 to get the full resolution
        const page = await pdfDocProxy!.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1 });
        
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };
        
        await page.render(renderContext).promise;

        // 2. Draw the overlay image
        const img = new Image();
        img.src = imagePreviewUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        // Convert UI dimensions to original PDF dimensions
        const originalWidth = imagePos.width / renderScale;
        const originalHeight = imagePos.height / renderScale;
        const originalX = imagePos.x / renderScale;
        const originalY = imagePos.y / renderScale;

        ctx.drawImage(img, originalX, originalY, originalWidth, originalHeight);

        // 3. Export and download
        const mimeType = exportFormat === 'jpg' ? 'image/jpeg' : 'image/png';
        const dataUrl = exportCanvas.toDataURL(mimeType, 0.9);
        
        const link = document.createElement('a');
        link.href = dataUrl;
        const baseName = pdfFile.name.replace(/\.[^/.]+$/, "");
        link.download = `${baseName}_page${currentPage}.${exportFormat}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export. ' + (error instanceof Error ? error.message : ''));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-100 font-sans">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-neutral-200 flex flex-col shadow-sm z-10">
        <div className="p-6 border-b border-neutral-200">
          <h1 className="text-xl font-semibold text-neutral-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            PDF Image Adder
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Add images to your PDF visually</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Step 1: Upload PDF */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-wider">1. Upload PDF</h2>
            <div className="relative">
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePdfUpload}
                className="hidden"
                id="pdf-upload"
              />
              <label
                htmlFor="pdf-upload"
                className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-neutral-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors cursor-pointer group"
              >
                <div className="flex flex-col items-center gap-2 text-neutral-500 group-hover:text-indigo-600">
                  <Upload className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {pdfFile ? pdfFile.name : 'Choose PDF file'}
                  </span>
                </div>
              </label>
            </div>
            {pdfFile && (
              <div className="flex items-center justify-between bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="text-sm text-neutral-600 truncate">{pdfFile.name}</span>
                </div>
                <button 
                  onClick={() => setPdfFile(null)}
                  className="p-1 hover:bg-neutral-200 rounded-md text-neutral-500 transition-colors"
                  title="Remove PDF"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Upload Image */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-wider">2. Upload Image</h2>
            <div className="relative">
              <input
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-neutral-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors cursor-pointer group"
              >
                <div className="flex flex-col items-center gap-2 text-neutral-500 group-hover:text-indigo-600">
                  <ImageIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {imageFile ? imageFile.name : 'Choose Image (PNG/JPG)'}
                  </span>
                </div>
              </label>
            </div>
            {imagePreviewUrl && (
              <div className="relative group rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50 p-2">
                <img src={imagePreviewUrl} alt="Preview" className="w-full h-32 object-contain" />
                <button 
                  onClick={() => {
                    setImageFile(null);
                    setImagePreviewUrl(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-red-50 text-neutral-600 hover:text-red-600 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove Image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          {/* Step 3: Page Navigation */}
          {numPages > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-wider">3. Select Page</h2>
              <div className="flex items-center justify-between bg-neutral-50 p-2 rounded-xl border border-neutral-200">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-neutral-600" />
                </button>
                <span className="text-sm font-medium text-neutral-700">
                  Page {currentPage} of {numPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                  disabled={currentPage >= numPages}
                  className="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-neutral-600" />
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Export Button */}
        <div className="p-6 border-t border-neutral-200 bg-neutral-50 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-600 uppercase tracking-wider">Export Format</label>
            <div className="flex bg-white rounded-lg border border-neutral-200 p-1">
              <button
                onClick={() => setExportFormat('pdf')}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${exportFormat === 'pdf' ? 'bg-indigo-100 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-50'}`}
              >
                PDF
              </button>
              <button
                onClick={() => setExportFormat('jpg')}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${exportFormat === 'jpg' ? 'bg-indigo-100 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-50'}`}
              >
                JPG
              </button>
              <button
                onClick={() => setExportFormat('png')}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${exportFormat === 'png' ? 'bg-indigo-100 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-50'}`}
              >
                PNG
              </button>
            </div>
          </div>
          
          <button
            onClick={handleExport}
            disabled={!pdfFile || !imageFile || isExporting}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 disabled:text-neutral-500 text-white rounded-xl font-medium transition-colors shadow-sm disabled:shadow-none"
          >
            {isExporting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
            {isExporting ? 'Exporting...' : `Download ${exportFormat.toUpperCase()}`}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative" ref={containerRef}>
        {!pdfFile ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-400">
            <FileText className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Upload a PDF to get started</p>
            <p className="text-sm mt-1">You can then add and position images visually.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-neutral-200/50">
            <div 
              className="relative bg-white shadow-xl ring-1 ring-neutral-900/5 transition-all"
              style={{
                width: pageDimensions.width,
                height: pageDimensions.height,
              }}
            >
              <canvas ref={canvasRef} className="block" />
              
              {imagePreviewUrl && (
                <Rnd
                  bounds="parent"
                  position={{ x: imagePos.x, y: imagePos.y }}
                  size={{ width: imagePos.width, height: imagePos.height }}
                  onDragStop={(e, d) => {
                    setImagePos(prev => ({ ...prev, x: d.x, y: d.y }));
                  }}
                  onResizeStop={(e, direction, ref, delta, position) => {
                    setImagePos({
                      width: parseInt(ref.style.width, 10),
                      height: parseInt(ref.style.height, 10),
                      ...position,
                    });
                  }}
                  className="group"
                >
                  <div className="w-full h-full relative">
                    <img
                      src={imagePreviewUrl}
                      alt="Overlay"
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    {/* Resize handles visual indicators */}
                    <div className="absolute inset-0 border-2 border-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                </Rnd>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
