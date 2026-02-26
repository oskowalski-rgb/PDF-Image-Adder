import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Upload, Download, ChevronLeft, ChevronRight, Image as ImageIcon, FileText, Trash2 } from 'lucide-react';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type OverlayImage = {
  id: string;
  file: File;
  previewUrl: string;
  pos: { x: number; y: number; width: number; height: number };
};

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [overlayImages, setOverlayImages] = useState<OverlayImage[]>([]);
  
  const [pdfDocProxy, setPdfDocProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
  const [renderScale, setRenderScale] = useState(1);
  const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 });
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'jpg' | 'png'>('pdf');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Handle PDF Upload
  const handlePdfUpload = (file: File) => {
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
    } else {
      alert('Please select a valid PDF file.');
    }
  };

  // Handle Image Upload
  const handleImageUpload = (files: FileList | File[]) => {
    const newImages: OverlayImage[] = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        newImages.push({
          id: Math.random().toString(36).substr(2, 9),
          file,
          previewUrl: url,
          pos: { x: 50 + (newImages.length * 20), y: 50 + (newImages.length * 20), width: 150, height: 150 }
        });
      }
    });

    if (newImages.length > 0) {
      setOverlayImages(prev => [...prev, ...newImages]);
    } else {
      alert('Please select valid image files.');
    }
  };

  // Handle Drag and Drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length === 0) return;

    // Check if there's a PDF in the dropped files
    const pdfFile = files.find(f => f.type === 'application/pdf');
    if (pdfFile) {
      handlePdfUpload(pdfFile);
    }

    // Check for images
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      handleImageUpload(imageFiles);
    }
  }, []);

  const removeImage = (id: string) => {
    setOverlayImages(prev => prev.filter(img => img.id !== id));
  };

  const updateImagePos = (id: string, newPos: Partial<OverlayImage['pos']>) => {
    setOverlayImages(prev => prev.map(img => 
      img.id === id ? { ...img, pos: { ...img.pos, ...newPos } } : img
    ));
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
    if (!pdfFile || !canvasRef.current) return;
    
    setIsExporting(true);
    try {
      if (exportFormat === 'pdf') {
        // Load the PDF with pdf-lib
        const pdfBytes = await pdfFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        
        // Get the target page (0-indexed in pdf-lib)
        const pages = pdfDoc.getPages();
        const page = pages[currentPage - 1];

        // Draw all images
        for (const img of overlayImages) {
          const imageBytes = await img.file.arrayBuffer();
          let pdfImage;
          if (img.file.type === 'image/png') {
            pdfImage = await pdfDoc.embedPng(imageBytes);
          } else if (img.file.type === 'image/jpeg' || img.file.type === 'image/jpg') {
            pdfImage = await pdfDoc.embedJpg(imageBytes);
          } else {
            throw new Error('Unsupported image format. Please use PNG or JPEG.');
          }
          
          // Calculate coordinates and dimensions
          // pdf-lib's coordinate system has origin at bottom-left
          // Our UI has origin at top-left
          
          // 1. Convert UI dimensions to original PDF dimensions
          const originalWidth = img.pos.width / renderScale;
          const originalHeight = img.pos.height / renderScale;
          const originalX = img.pos.x / renderScale;
          const originalY = img.pos.y / renderScale;
          
          // 2. Convert Y coordinate to bottom-left origin
          const pdfY = page.getHeight() - originalY - originalHeight;
          
          // Draw the image
          page.drawImage(pdfImage, {
            x: originalX,
            y: pdfY,
            width: originalWidth,
            height: originalHeight,
          });
        }
        
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

        // Target 300 DPI for high-quality print (default PDF scale 1 is 72 DPI)
        const targetDPI = 300;
        const exportScale = targetDPI / 72;

        // 1. Draw the PDF page
        // We need to re-render the page at the target scale to get high resolution
        const page = await pdfDocProxy!.getPage(currentPage);
        const viewport = page.getViewport({ scale: exportScale });

        // Set dimensions to match the scaled PDF page size
        exportCanvas.width = viewport.width;
        exportCanvas.height = viewport.height;
        
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };
        
        await page.render(renderContext).promise;

        // 2. Draw all overlay images
        for (const overlayImg of overlayImages) {
          const img = new Image();
          img.src = overlayImg.previewUrl;
          await new Promise((resolve) => {
            img.onload = resolve;
          });

          // Convert UI dimensions to the 300 DPI export dimensions
          const scaledWidth = (overlayImg.pos.width / renderScale) * exportScale;
          const scaledHeight = (overlayImg.pos.height / renderScale) * exportScale;
          const scaledX = (overlayImg.pos.x / renderScale) * exportScale;
          const scaledY = (overlayImg.pos.y / renderScale) * exportScale;

          ctx.drawImage(img, scaledX, scaledY, scaledWidth, scaledHeight);
        }

        // 3. Export and download
        const mimeType = exportFormat === 'jpg' ? 'image/jpeg' : 'image/png';
        const dataUrl = exportCanvas.toDataURL(mimeType, 1.0);
        
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
    <div 
      className={`flex h-screen font-sans transition-colors ${isDraggingOver ? 'bg-indigo-50' : 'bg-neutral-100'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-500/20 backdrop-blur-sm pointer-events-none">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-indigo-900">Drop files here</h2>
            <p className="text-indigo-600 font-medium">PDFs or Images (PNG/JPG)</p>
          </div>
        </div>
      )}

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
                onChange={(e) => e.target.files?.[0] && handlePdfUpload(e.target.files[0])}
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
                    {pdfFile ? 'Change PDF file' : 'Choose PDF file'}
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
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-wider">2. Upload Images</h2>
            <div className="relative">
              <input
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                multiple
                onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
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
                    Add Images (PNG/JPG)
                  </span>
                </div>
              </label>
            </div>
            
            {overlayImages.length > 0 && (
              <div className="space-y-2">
                {overlayImages.map((img) => (
                  <div key={img.id} className="flex items-center justify-between bg-neutral-50 p-2 rounded-lg border border-neutral-200">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <img src={img.previewUrl} alt="Preview" className="w-8 h-8 object-cover rounded bg-white border border-neutral-200" />
                      <span className="text-sm text-neutral-600 truncate">{img.file.name}</span>
                    </div>
                    <button 
                      onClick={() => removeImage(img.id)}
                      className="p-1.5 hover:bg-red-50 text-neutral-500 hover:text-red-600 rounded-md transition-colors"
                      title="Remove Image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
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
            disabled={!pdfFile || isExporting}
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
            <div className="w-24 h-24 mb-6 rounded-full bg-white shadow-sm flex items-center justify-center border border-neutral-200">
              <Upload className="w-10 h-10 text-neutral-300" />
            </div>
            <p className="text-xl font-medium text-neutral-600">Drag and drop a PDF here</p>
            <p className="text-sm mt-2">Or use the upload button in the sidebar</p>
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
              
              {overlayImages.map((img) => (
                <Rnd
                  key={img.id}
                  bounds="parent"
                  position={{ x: img.pos.x, y: img.pos.y }}
                  size={{ width: img.pos.width, height: img.pos.height }}
                  lockAspectRatio={true}
                  onDragStop={(e, d) => {
                    updateImagePos(img.id, { x: d.x, y: d.y });
                  }}
                  onResizeStop={(e, direction, ref, delta, position) => {
                    updateImagePos(img.id, {
                      width: parseInt(ref.style.width, 10),
                      height: parseInt(ref.style.height, 10),
                      ...position,
                    });
                  }}
                  className="group"
                >
                  <div className="w-full h-full relative">
                    <img
                      src={img.previewUrl}
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
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
