declare module '../reports/summary.js' {
  // La firma mínima que k6 entiende para handleSummary
  export function handleSummary(data: any): {
    [outfile: string]: string; // contenido del archivo (HTML/JSON)
  };
}