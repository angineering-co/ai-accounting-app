"use client";

import { useCallback, useId, useRef } from "react";
import { Camera, Images } from "lucide-react";
import {
  getUploadFileId,
  type UseSupabaseUploadReturn,
} from "@/hooks/use-supabase-upload";
import { Button } from "@/components/ui/button";
import type { FileError } from "react-dropzone";

type UploadFile = UseSupabaseUploadReturn["files"][number];

type MobileUploadActionsProps = Pick<
  UseSupabaseUploadReturn,
  "files" | "setFiles" | "allowedMimeTypes" | "maxFileSize" | "maxFiles"
>;

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

const toUploadFile = (
  file: File,
  allowedMimeTypes: string[],
  maxFileSize: number,
): UploadFile => {
  const errors: FileError[] = [];

  if (!isMimeTypeAllowed(file.type, allowedMimeTypes)) {
    errors.push({
      code: "file-invalid-type",
      message: "File type must match accepted formats",
    });
  }

  if (file.size > maxFileSize) {
    errors.push({
      code: "file-too-large",
      message: `File is larger than ${maxFileSize} bytes`,
    });
  }

  const uploadFile = file as UploadFile;
  uploadFile.errors = errors;
  uploadFile.preview = URL.createObjectURL(file);
  return uploadFile;
};

export function MobileUploadActions({
  files,
  setFiles,
  allowedMimeTypes,
  maxFileSize,
  maxFiles,
}: MobileUploadActionsProps) {
  const cameraInputId = useId();
  const libraryInputId = useId();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const handleAddFiles = useCallback(
    (selectedFiles: File[]) => {
      if (selectedFiles.length === 0) return;

      setFiles((prevFiles) => {
        const existingFingerprints = new Set(
          prevFiles.map((file) => getUploadFileId(file)),
        );
        const nextFiles = [...prevFiles];

        for (const file of selectedFiles) {
          const fingerprint = getUploadFileId(file);
          if (existingFingerprints.has(fingerprint)) continue;

          existingFingerprints.add(fingerprint);
          nextFiles.push(toUploadFile(file, allowedMimeTypes, maxFileSize));
        }

        if (nextFiles.length <= maxFiles) {
          return nextFiles;
        }

        return nextFiles.map((file, index) => {
          if (index < maxFiles) return file;
          return {
            ...file,
            errors: [
              ...file.errors.filter((error) => error.code !== "too-many-files"),
              {
                code: "too-many-files",
                message: "Too many files",
              },
            ],
          };
        });
      });
    },
    [allowedMimeTypes, maxFileSize, maxFiles, setFiles],
  );

  const acceptedFileTypes = allowedMimeTypes.join(",");
  const cameraAcceptedTypes = "image/*";

  const handleInputFiles = useCallback(
    (files: FileList | null, input: HTMLInputElement | null) => {
      // FileList is live in browsers; copy first so clearing the input doesn't erase pending files.
      const snapshot = files ? Array.from(files) : [];
      handleAddFiles(snapshot);
      if (input) {
        input.value = "";
      }
    },
    [handleAddFiles],
  );

  const openPicker = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  }, []);

  return (
    <div className="mb-3 flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        手機可直接拍照上傳，或從相簿選取檔案。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => openPicker(cameraInputRef.current)}
          disabled={files.length >= maxFiles}
        >
          <Camera className="mr-1 h-4 w-4" />
          拍照上傳
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openPicker(libraryInputRef.current)}
          disabled={files.length >= maxFiles}
        >
          <Images className="mr-1 h-4 w-4" />
          從相簿選取
        </Button>
      </div>

      <input
        id={cameraInputId}
        ref={cameraInputRef}
        type="file"
        className="pointer-events-none absolute h-px w-px opacity-0"
        accept={cameraAcceptedTypes}
        capture="environment"
        multiple={maxFiles !== 1}
        onChange={(event) => {
          handleInputFiles(event.currentTarget.files, event.currentTarget);
        }}
      />
      <input
        id={libraryInputId}
        ref={libraryInputRef}
        type="file"
        className="pointer-events-none absolute h-px w-px opacity-0"
        accept={acceptedFileTypes}
        multiple={maxFiles !== 1}
        onChange={(event) => {
          handleInputFiles(event.currentTarget.files, event.currentTarget);
        }}
      />
    </div>
  );
}
