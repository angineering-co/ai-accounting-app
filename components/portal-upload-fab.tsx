"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Camera, FileText, Images, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
type DocumentTypeOption = {
  label: string;
  inOrOut: "in" | "out";
  type: "invoice" | "allowance";
  icon: typeof FileText;
  description: string;
};

const DOCUMENT_TYPES: DocumentTypeOption[] = [
  {
    label: "進項發票",
    inOrOut: "in",
    type: "invoice",
    icon: FileText,
    description: "購買商品取得的發票",
  },
  {
    label: "銷項發票",
    inOrOut: "out",
    type: "invoice",
    icon: Receipt,
    description: "銷售商品開出的發票",
  },
  {
    label: "進項折讓",
    inOrOut: "in",
    type: "allowance",
    icon: FileText,
    description: "購買退貨的折讓證明單",
  },
  {
    label: "銷項折讓",
    inOrOut: "out",
    type: "allowance",
    icon: Receipt,
    description: "銷售退貨的折讓證明單",
  },
];

const isMimeTypeAllowed = (fileType: string, allowedMimeTypes: string[]) => {
  if (allowedMimeTypes.length === 0) return true;
  return allowedMimeTypes.some((allowedType) => {
    if (allowedType.endsWith("/*")) {
      const allowedPrefix = allowedType.slice(0, allowedType.indexOf("/"));
      return fileType.startsWith(`${allowedPrefix}/`);
    }
    return fileType === allowedType;
  });
};

const ALLOWED_MIME_TYPES = ["image/*", "application/pdf"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

type PortalUploadFabProps = {
  onFilesSelected: (
    files: File[],
    inOrOut: "in" | "out",
    type: "invoice" | "allowance",
  ) => void;
  isLocked: boolean;
};

export function PortalUploadFab({
  onFilesSelected,
  isLocked,
}: PortalUploadFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDocType, setSelectedDocType] =
    useState<DocumentTypeOption | null>(null);

  // Reset to document type picker whenever the sheet opens
  const handleOpenChange = (open: boolean) => {
    if (open) setSelectedDocType(null);
    setIsOpen(open);
  };
  const cameraInputId = useId();
  const libraryInputId = useId();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null, input: HTMLInputElement | null) => {
      const snapshot = fileList ? Array.from(fileList) : [];
      if (snapshot.length === 0 || !selectedDocType) return;

      const validFiles = snapshot.filter(
        (f) =>
          isMimeTypeAllowed(f.type, ALLOWED_MIME_TYPES) &&
          f.size <= MAX_FILE_SIZE,
      );

      if (validFiles.length > 0) {
        onFilesSelected(
          validFiles,
          selectedDocType.inOrOut,
          selectedDocType.type,
        );
      }

      if (input) input.value = "";
      setSelectedDocType(null);
      setIsOpen(false);
    },
    [selectedDocType, onFilesSelected],
  );

  const openPicker = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  }, []);

  const handleDocTypeSelect = (docType: DocumentTypeOption) => {
    setSelectedDocType(docType);
  };

  if (isLocked) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition-transform active:scale-95 md:hidden"
        aria-label="上傳憑證"
      >
        <Camera className="h-6 w-6" />
      </button>

      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle>
              {selectedDocType
                ? `上傳${selectedDocType.label}`
                : "選擇文件類型"}
            </SheetTitle>
          </SheetHeader>

          {!selectedDocType ? (
            <div className="grid grid-cols-2 gap-3">
              {DOCUMENT_TYPES.map((docType) => {
                const Icon = docType.icon;
                return (
                  <button
                    key={`${docType.inOrOut}-${docType.type}`}
                    type="button"
                    onClick={() => handleDocTypeSelect(docType)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center transition-colors active:bg-emerald-50 active:border-emerald-200"
                  >
                    <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium text-slate-900">
                      {docType.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      {docType.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-3">
                <Button
                  type="button"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => openPicker(cameraInputRef.current)}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  拍照上傳
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => openPicker(libraryInputRef.current)}
                >
                  <Images className="mr-2 h-4 w-4" />
                  從相簿選取
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-slate-500"
                onClick={() => setSelectedDocType(null)}
              >
                <X className="mr-1 h-4 w-4" />
                返回選擇類型
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <input
        id={cameraInputId}
        ref={cameraInputRef}
        type="file"
        className="pointer-events-none absolute h-px w-px opacity-0"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFiles(e.currentTarget.files, e.currentTarget)}
      />
      <input
        id={libraryInputId}
        ref={libraryInputRef}
        type="file"
        className="pointer-events-none absolute h-px w-px opacity-0"
        accept="image/*,application/pdf"
        multiple
        onChange={(e) => handleFiles(e.currentTarget.files, e.currentTarget)}
      />
    </>
  );
}
