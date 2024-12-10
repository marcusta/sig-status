import type { DriveStatus } from "./types";

export function htmlReport(statuses: DriveStatus[]): string {
  return `
    <html>
      <head>
        <title>Drive Status Report</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css">
      </head>
      <body>
        <h1>Drive Status Report</h1>
        <table class="table is-striped is-fullwidth">
          <tr>
            <th>Machine</th>
            <th>C Drive Space</th>
            <th>D Drive Space</th>
          </tr>
          ${statuses
            .map(
              (status) => `
            <tr class="is-${status.cDriveSpace < 10 ? "danger" : "warning"}">
              <td>${status.machine}</td>
              <td>${status.cDriveSpace}</td>
              <td>${status.dDriveSpace}</td>
            </tr>
          `
            )
            .join("")}
        </table>
      </body>
    </html>
  `;
}
