import { Children, cloneElement, isValidElement } from "react";
import type { ReactNode, ReactElement, TableHTMLAttributes } from "react";
type Element = ReactElement<{ children?: ReactNode; "data-label"?: string }>;
function label(node: ReactNode): string {
  return Children.toArray(node)
    .map((n) =>
      typeof n === "string" || typeof n === "number"
        ? String(n)
        : isValidElement(n)
          ? label((n as Element).props.children)
          : "",
    )
    .join(" ");
}
export default function ResponsiveTable({
  children,
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  const sections = Children.toArray(children);
  const head = sections.find((n) => isValidElement(n) && n.type === "thead") as
    Element | undefined;
  const row = head
    ? (Children.toArray(head.props.children).find(isValidElement) as Element)
    : undefined;
  const headers = row
    ? Children.toArray(row.props.children).map((n) => label(n))
    : [];
  return (
    <table {...props} className={className + " responsive-table"}>
      {sections.map((section) => {
        if (!isValidElement(section) || section.type !== "tbody")
          return section;
        const body = section as Element;
        return cloneElement(
          body,
          {},
          Children.map(body.props.children, (row) => {
            if (!isValidElement(row)) return row;
            const r = row as Element;
            return cloneElement(
              r,
              {},
              Children.map(r.props.children, (cell, index) =>
                isValidElement(cell)
                  ? cloneElement(
                      cell as Element,
                      { "data-label": headers[index] ?? "" },
                      <div className="table-cell-value">
                        {(cell as Element).props.children}
                      </div>,
                    )
                  : cell,
              ),
            );
          }),
        );
      })}
    </table>
  );
}
