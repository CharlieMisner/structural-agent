/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '@weave-design/theme-context' {
  import React from 'react';
  export const ThemeContext: React.Context<any>;
  export default ThemeContext;
}

declare module '@weave-design/theme-data/build/esm/darkBlueMediumDensityTheme' {
  const theme: Record<string, string>;
  export default theme;
}

declare module '@weave-design/theme-data/build/esm/lightGrayMediumDensityTheme' {
  const theme: Record<string, string>;
  export default theme;
}

declare module '@weave-design/tree-view' {
  import React from 'react';

  export interface TreeViewProps {
    alternateBg?: boolean;
    children?: React.ReactNode;
    defaultSelected?: string;
    guidelines?: boolean;
    indicator?: 'caret' | 'operator';
    onChange?: (id: string) => void;
    onKeyDown?: (event: React.KeyboardEvent) => void;
    selected?: string;
    stylesheet?: any;
    treeNode?: any;
  }

  export interface TreeItemProps {
    id: string;
    label?: React.ReactNode;
    icon?: React.ReactNode;
    collapsed?: boolean;
    defaultCollapsed?: boolean;
    expandByDoubleClick?: boolean;
    onOperatorClick?: (event: React.MouseEvent) => void;
    stylesheet?: any;
    children?: React.ReactNode;
  }

  export const TreeItem: React.FC<TreeItemProps>;
  const TreeView: React.FC<TreeViewProps>;
  export default TreeView;
}

declare module '@weave-design/button' {
  import React from 'react';

  export interface ButtonProps {
    disabled?: boolean;
    icon?: React.ReactNode;
    link?: string;
    onClick?: (event: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
    title?: string;
    type?: 'solid' | 'outline' | 'flat';
    width?: 'shrink' | 'grow';
    children?: React.ReactNode;
    stylesheet?: any;
    target?: string;
  }

  const Button: React.FC<ButtonProps>;
  export default Button;
}

declare module '@weave-design/typography' {
  import React from 'react';

  export interface TypographyProps {
    align?: 'left' | 'center' | 'right' | 'justify';
    elementType?: string;
    children?: React.ReactNode;
    fontWeight?: 'regular' | 'medium' | 'bold';
    variant?: 'h1' | 'h2' | 'h3' | 'body' | 'caption';
    stylesheet?: any;
  }

  const Typography: React.FC<TypographyProps>;
  export default Typography;
}

declare module '@weave-design/icons' {
  import React from 'react';

  export const Folder16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const Folder24: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FolderOpen16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FolderOpen24: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FileAssembly16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FileAssembly24: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FilePart16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FilePart24: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FileSpreadsheet16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FileSpreadsheet24: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FilePdf16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FilePdf24: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FileDocument16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FileDocument24: React.FC<React.SVGProps<SVGSVGElement>>;
  export const FileGeneric16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const DocumentManagement16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const DocumentManagement24: React.FC<React.SVGProps<SVGSVGElement>>;
  export const Checkmark16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const Settings16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const Project16: React.FC<React.SVGProps<SVGSVGElement>>;
  export const AddFolder16: React.FC<React.SVGProps<SVGSVGElement>>;
}
