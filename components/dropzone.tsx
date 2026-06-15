'use client'

import { cn } from '@/lib/utils'
import { getUploadFileId, type UseSupabaseUploadReturn } from '@/hooks/use-supabase-upload'
import { Button } from '@/components/ui/button'
import { CheckCircle, File, Loader2, Upload, X } from 'lucide-react'
import { createContext, type PropsWithChildren, useCallback, useContext } from 'react'
import type { FileError } from 'react-dropzone'
import Image from 'next/image'

export const formatBytes = (
  bytes: number,
  decimals = 2,
  size?: 'bytes' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB' | 'EB' | 'ZB' | 'YB'
) => {
  const k = 1000
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  if (bytes === 0 || bytes === undefined) return size !== undefined ? `0 ${size}` : '0 bytes'
  const i = size !== undefined ? sizes.indexOf(size) : Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// Translate a dropzone/upload error into Traditional Chinese by its code, so we
// don't depend on the upstream (English) error text.
const fileErrorMessage = (error: FileError, maxFileSize: number, fileSize: number) => {
  switch (error.code) {
    case 'file-too-large':
      return `檔案 ${formatBytes(fileSize, 2)} 超過單檔上限 ${formatBytes(maxFileSize, 2)}`
    case 'file-invalid-type':
      return '檔案格式不支援，僅接受 PDF 或圖片'
    case 'too-many-files':
      return '檔案數量過多'
    default:
      return error.message
  }
}

type DropzoneContextType = Omit<UseSupabaseUploadReturn, 'getRootProps' | 'getInputProps'>

const DropzoneContext = createContext<DropzoneContextType | undefined>(undefined)

type DropzoneProps = UseSupabaseUploadReturn & {
  className?: string
}

const Dropzone = ({
  className,
  children,
  getRootProps,
  getInputProps,
  ...restProps
}: PropsWithChildren<DropzoneProps>) => {
  const isSuccess = restProps.isSuccess
  const isActive = restProps.isDragActive
  const isInvalid =
    (restProps.isDragActive && restProps.isDragReject) ||
    (restProps.errors.length > 0 && !restProps.isSuccess) ||
    restProps.files.some((file) => file.errors.length !== 0)

  return (
    <DropzoneContext.Provider value={{ ...restProps }}>
      <div
        {...getRootProps({
          className: cn(
            'border-2 border-gray-300 rounded-lg p-6 text-center bg-card transition-colors duration-300 text-foreground',
            className,
            isSuccess ? 'border-solid' : 'border-dashed',
            isActive && 'border-primary bg-primary/10',
            isInvalid && 'border-destructive bg-destructive/10'
          ),
        })}
      >
        <input {...getInputProps()} />
        {children}
      </div>
    </DropzoneContext.Provider>
  )
}
const DropzoneContent = ({ className }: { className?: string }) => {
  const {
    files,
    setFiles,
    onUpload,
    loading,
    successes,
    errors,
    maxFileSize,
    maxFiles,
    maxTotalSize,
    totalSize,
    exceedsMaxTotalSize,
    isSuccess,
  } = useDropzoneContext()

  const exceedMaxFiles = files.length > maxFiles

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      setFiles(files.filter((file) => getUploadFileId(file) !== fileId))
    },
    [files, setFiles]
  )

  if (isSuccess) {
    return (
      <div className={cn('flex flex-row items-center gap-x-2 justify-center', className)}>
        <CheckCircle size={16} className="text-primary" />
        <p className="text-primary text-base">
          已成功上傳 {files.length} 個檔案
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {files.map((file, idx) => {
        const fileId = getUploadFileId(file)
        const fileError = errors.find((e) => e.fileId === fileId)
        const isSuccessfullyUploaded = !!successes.find((e) => e === fileId)

        return (
          <div
            key={`${file.name}-${idx}`}
            className="flex items-center gap-x-4 border-b py-2 first:mt-4 last:mb-4 "
          >
            {file.type.startsWith('image/') ? (
              <div className="h-10 w-10 rounded border overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                <Image 
                  src={file.preview || ''} 
                  alt={file.name} 
                  width={40}
                  height={40}
                  className="object-cover" 
                  unoptimized
                />
              </div>
            ) : (
              <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center">
                <File size={18} />
              </div>
            )}

            <div className="shrink grow flex flex-col items-start truncate">
              <p title={file.name} className="text-base truncate max-w-full">
                {file.name}
              </p>
              {file.errors.length > 0 ? (
                <p className="text-sm text-destructive">
                  {file.errors
                    .map((e) => fileErrorMessage(e, maxFileSize, file.size))
                    .join('、')}
                </p>
              ) : loading && !isSuccessfullyUploaded ? (
                <p className="text-sm text-muted-foreground">上傳中…</p>
              ) : !!fileError ? (
                <p className="text-sm text-destructive">上傳失敗：{fileError.message}</p>
              ) : isSuccessfullyUploaded ? (
                <p className="text-sm text-primary">已上傳</p>
              ) : (
                <p className="text-sm text-muted-foreground">{formatBytes(file.size, 2)}</p>
              )}
            </div>

            {!loading && !isSuccessfullyUploaded && (
              <Button
                size="icon"
                variant="link"
                className="shrink-0 justify-self-end text-muted-foreground hover:text-foreground"
                onClick={() => handleRemoveFile(fileId)}
              >
                <X />
              </Button>
            )}
          </div>
        )
      })}
      {exceedMaxFiles && (
        <p className="text-base text-left mt-2 text-destructive">
          最多只能上傳 {maxFiles} 個檔案，請移除 {files.length - maxFiles} 個。
        </p>
      )}
      {exceedsMaxTotalSize && (
        <p className="text-base text-left mt-2 text-destructive">
          這些檔案共 {formatBytes(totalSize, 2)}，超過單次上傳上限 {formatBytes(maxTotalSize, 2)}，請移除部分檔案。
        </p>
      )}
      {files.length > 0 && !exceedMaxFiles && (
        <div className="mt-2">
          <Button
            variant="outline"
            onClick={onUpload}
            disabled={
              files.some((file) => file.errors.length !== 0) ||
              loading ||
              exceedsMaxTotalSize
            }
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                上傳中…
              </>
            ) : (
              <>上傳檔案</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

const DropzoneEmptyState = ({ className }: { className?: string }) => {
  const { maxFileSize, maxTotalSize, inputRef, isSuccess } =
    useDropzoneContext()

  if (isSuccess) {
    return null
  }

  return (
    <div className={cn('flex flex-col items-center gap-y-2', className)}>
      <Upload size={20} className="text-muted-foreground" />
      <p className="text-base">上傳檔案</p>
      <div className="flex flex-col items-center gap-y-1">
        <p className="text-sm text-muted-foreground">
          拖曳檔案至此，或{' '}
          <a
            onClick={() => inputRef.current?.click()}
            className="underline cursor-pointer transition hover:text-foreground"
          >
            選擇檔案
          </a>
        </p>
        {maxFileSize !== Number.POSITIVE_INFINITY && (
          <p className="text-sm text-muted-foreground">
            單檔上限 {formatBytes(maxFileSize, 2)}
            {maxTotalSize !== Number.POSITIVE_INFINITY &&
              `（單次上限 ${formatBytes(maxTotalSize, 2)}）`}
          </p>
        )}
      </div>
    </div>
  )
}

const useDropzoneContext = () => {
  const context = useContext(DropzoneContext)

  if (!context) {
    throw new Error('useDropzoneContext must be used within a Dropzone')
  }

  return context
}

export { Dropzone, DropzoneContent, DropzoneEmptyState, useDropzoneContext }
