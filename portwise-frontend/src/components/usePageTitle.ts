import { useEffect } from "react";

const BASE = "PortWise: landed cost and import duty calculator for Nigeria";

export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | PortWise` : BASE;
  }, [title]);
}
