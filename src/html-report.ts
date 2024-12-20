import type { DriveStatus } from "./types";

export function htmlReport(statuses: DriveStatus[]): string {
  return `
    <html>
      <head>
        <title>Drive Status Report</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css">
        <style>
          .danger {
            background-color: red;
          }
          .warning {
            background-color: orange;
          }
        </style>
      </head>
      <body>
        <section class="section">
          <div class="container">
            <h1 class="title is-2 mb-6">Drive Status Report</h1>
            
            <div class="box">
              <table class="table is-striped is-fullwidth">
                <thead>
                  <tr>
                    <th>Machine</th>
                    <th>C Drive Space (GB)</th>
                    <th>D Drive Space (GB)</th>
                    <th>Last Email Sent</th>
                    <th>Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  ${statuses
                    .map((status) => {
                      const cWarningLevel =
                        status.c_drive_space < 10
                          ? "danger"
                          : status.c_drive_space < 20
                          ? "warning"
                          : "";
                      const dWarningLevel =
                        status.d_drive_space < 10
                          ? "danger"
                          : status.d_drive_space < 20
                          ? "warning"
                          : "";
                      console.log(cWarningLevel, " :: d :: ", dWarningLevel);
                      return `
                        <tr}">
                          <td class="is-size-5">${status.machine}</td>
                          <td class="is-size-5 ${cWarningLevel}">${status.c_drive_space?.toFixed(
                        1
                      )}</td>
                          <td class="is-size-5 ${dWarningLevel}">${status.d_drive_space?.toFixed(
                        1
                      )}</td>
                          <td class="is-size-5">${formatDate(
                            status.last_email_sent
                          )}</td>
                          <td class="is-size-5">${formatDate(
                            status.timestamp
                          )}</td>
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
            
            <p class="help mt-4">
              <span class="has-text-danger">■</span> Less than 10GB available
              <span class="ml-4 has-text-warning">■</span> Less than 20GB available
            </p>
          </div>
        </section>
      </body>
    </html>
  `;
}

export function formatDate(dateAsString: string): string {
  // format as 10.12.2024 10:00
  if (!dateAsString) {
    return "";
  }
  return new Date(dateAsString).toLocaleString("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
