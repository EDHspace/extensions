import type { ReactNode } from "react";

export function DataTable<T>({
    rows,
    columns,
    rowId,
    label,
}: {
    rows: readonly T[];
    columns: readonly { id: string; title: string; render(row: T): ReactNode }[];
    rowId(row: T): string;
    label: string;
}) {
    return (
        <div className="edhspace-table-scroll">
            <table aria-label={label}>
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th key={column.id} scope="col">
                                {column.title}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={rowId(row)}>
                            {columns.map((column) => (
                                <td key={column.id}>{column.render(row)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
