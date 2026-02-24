export interface PageOptions {
  page?: number;
  pageSize?: number;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function paginateArray<T>(
  items: T[],
  options: PageOptions,
): { items: T[]; page_info: PageInfo } {
  const page = Math.max(1, Number(options.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize ?? 20)));
  const totalItems = items.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page_info: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}
