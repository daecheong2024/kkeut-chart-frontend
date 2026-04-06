import React, { useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough,
    AlignLeft, AlignCenter, AlignRight,
    Heading1, Heading2, Heading3,
    List, ListOrdered, Undo, Redo,
    Image as ImageIcon, FileText, Loader2
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for pdfjs-dist
// Using CDN to avoid bundler configuration issues with the worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface RichTextEditorProps {
    content: string;
    onChange: (html: string) => void;
    placeholder?: string;
    readOnly?: boolean;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
    content,
    onChange,
    placeholder = '내용을 입력하세요...',
    readOnly = false
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isConvertingPdf, setIsConvertingPdf] = React.useState(false);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            Image.configure({
                inline: true,
                allowBase64: true,
            }),
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
            Placeholder.configure({
                placeholder,
            }),
        ],
        content,
        editable: !readOnly,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose-base m-5 focus:outline-none max-w-none min-h-[500px]',
            },
        },
    });

    // Update content if it changes externally (and isn't just the editor's own update)
    // Note: This needs careful handling to avoid cursor jumps, but for this use case (switching templates) it's acceptable.
    React.useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            // Only update if the content is significantly different to avoid loops
            // For simplicity in this settings page context, we'll just set it.
            // In a real-time collab scenario, this would need more checks.
            if (editor.getText() === '' && content === '') return; // Avoid clearing if already empty and matching
            // Ideally we check if focused. For now, we assume external updates happen mainly on template load.
            if (!editor.isFocused) {
                editor.commands.setContent(content);
            }
        }
    }, [content, editor]);


    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editor) return;

        if (file.type !== 'application/pdf') {
            alert('PDF 파일만 업로드 가능합니다.');
            return;
        }

        setIsConvertingPdf(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            // Insert images for each page
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 }); // High quality scale

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (context) {
                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    } as any).promise;

                    const dataUrl = canvas.toDataURL('image/png');
                    editor.chain().focus().setImage({ src: dataUrl }).run();
                    editor.chain().focus().createParagraphNear().run(); // Add spacing
                }
            }
        } catch (error) {
            console.error('PDF conversion failed:', error);
            alert('PDF 변환에 실패했습니다.');
        } finally {
            setIsConvertingPdf(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (!editor) {
        return null;
    }

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col h-full">
            {/* Toolbar */}
            {!readOnly && (
                <div className="flex items-center flex-wrap gap-1 p-2 border-b border-gray-100 bg-gray-50/50">
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        isActive={editor.isActive('bold')}
                        icon={<Bold className="w-4 h-4" />}
                        title="굵게"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        isActive={editor.isActive('italic')}
                        icon={<Italic className="w-4 h-4" />}
                        title="기울임"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        isActive={editor.isActive('underline')}
                        icon={<UnderlineIcon className="w-4 h-4" />}
                        title="밑줄"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        isActive={editor.isActive('strike')}
                        icon={<Strikethrough className="w-4 h-4" />}
                        title="취소선"
                    />

                    <div className="w-px h-6 bg-gray-200 mx-1" />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        isActive={editor.isActive('heading', { level: 1 })}
                        icon={<Heading1 className="w-4 h-4" />}
                        title="제목 1"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        isActive={editor.isActive('heading', { level: 2 })}
                        icon={<Heading2 className="w-4 h-4" />}
                        title="제목 2"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        isActive={editor.isActive('heading', { level: 3 })}
                        icon={<Heading3 className="w-4 h-4" />}
                        title="제목 3"
                    />

                    <div className="w-px h-6 bg-gray-200 mx-1" />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        isActive={editor.isActive({ textAlign: 'left' })}
                        icon={<AlignLeft className="w-4 h-4" />}
                        title="왼쪽 정렬"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        isActive={editor.isActive({ textAlign: 'center' })}
                        icon={<AlignCenter className="w-4 h-4" />}
                        title="가운데 정렬"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        isActive={editor.isActive({ textAlign: 'right' })}
                        icon={<AlignRight className="w-4 h-4" />}
                        title="오른쪽 정렬"
                    />

                    <div className="w-px h-6 bg-gray-200 mx-1" />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        isActive={editor.isActive('bulletList')}
                        icon={<List className="w-4 h-4" />}
                        title="글머리 기호"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        isActive={editor.isActive('orderedList')}
                        icon={<ListOrdered className="w-4 h-4" />}
                        title="번호 매기기"
                    />

                    <div className="w-px h-6 bg-gray-200 mx-1" />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                        icon={<Undo className="w-4 h-4" />}
                        title="실행 취소"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                        icon={<Redo className="w-4 h-4" />}
                        title="다시 실행"
                    />

                    <div className="flex-1" />

                    {/* Image & PDF Upload */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="application/pdf,image/*"
                        onChange={handlePdfUpload}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isConvertingPdf}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-md transition-colors disabled:opacity-50"
                    >
                        {isConvertingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        PDF/이미지 업로드
                    </button>
                </div>
            )}

            {/* Editor Content Area - Styled to look like A4 paper if needed, currently fluid */}
            <div className="flex-1 bg-gray-100 p-4 md:p-8 overflow-y-auto cursor-text" onClick={() => editor.chain().focus().run()}>
                <div className="max-w-[210mm] mx-auto bg-white min-h-[297mm] shadow-sm p-[20mm]">
                    <EditorContent editor={editor} />
                </div>
            </div>
        </div>
    );
};

interface ToolbarButtonProps {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    icon: React.ReactNode;
    title?: string;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, isActive, disabled, icon, title }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`p-1.5 rounded-md transition-colors ${isActive
            ? 'bg-gray-200 text-gray-900'
            : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900'
            } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
    >
        {icon}
    </button>
);
