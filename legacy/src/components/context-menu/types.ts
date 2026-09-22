export interface ContextMenuItemType {
  key?: string | number;
  label: string;
  onClick?: () => void;
  children?: ContextMenuItemType[];
}
