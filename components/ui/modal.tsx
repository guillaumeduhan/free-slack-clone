'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/client/cn';
import { CloseIcon } from './icons';

type Props = {
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** Top offset of the panel, like the design's padding-top: 14vh. */
  top?: string;
  z?: number;
  className?: string;
};

/** Dimmed overlay + panel, closes on backdrop click and Escape. */
export function Modal({ onClose, children, width = 480, top = '14vh', z = 50, className }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-start justify-center bg-black/60 px-4" style={{ paddingTop: top, zIndex: z }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn('overflow-hidden rounded-[10px] border border-line bg-bg shadow-[0_20px_50px_rgba(0,0,0,.5)]', className)}
        style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, sub, onClose }: { title: ReactNode; sub?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-1">
      <div className="min-w-0">
        <div className="truncate text-lg font-black">{title}</div>
        {sub && <div className="mt-1 text-[13px] text-mute">{sub}</div>}
      </div>
      <IconButton onClick={onClose} title="Close" size={30}><CloseIcon size={16} className="text-txt2" /></IconButton>
    </div>
  );
}

export function IconButton({ size = 32, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: number }) {
  return (
    <button
      className={cn('flex flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent outline-none hover:bg-hover', className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Small buttons used in dialogs (36px, 13px bold). */
export function DialogButton({ variant = 'primary', disabled, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'danger-outline' }) {
  return (
    <button
      className={cn(
        'h-9 cursor-pointer rounded-md px-3.5 text-[13px] font-bold whitespace-nowrap outline-none',
        variant === 'primary' && (disabled ? 'bg-line3 px-4 text-white' : 'bg-accent px-4 text-white'),
        variant === 'secondary' && 'border border-line3 bg-transparent text-txt hover:bg-hover',
        variant === 'danger' && 'bg-danger px-4 text-white hover:bg-[#dc3e42]',
        variant === 'danger-outline' && 'h-[34px] border border-danger bg-transparent text-danger-text hover:bg-danger/12',
        className,
      )}
      {...rest}
    />
  );
}
