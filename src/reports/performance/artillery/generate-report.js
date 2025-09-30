const fs = require('fs');
const path = require('path');

// Función para renderizar un objeto como tabla compacta (estilo dark)
function renderObjectTable(obj) {
  if (!obj || Object.keys(obj).length === 0) {
    return '<p>No hay datos disponibles.</p>';
  }
  let rows = '';
  for (const key in obj) {
    if (Object.hasOwnProperty.call(obj, key)) {
      rows += `<tr><td>${key}</td><td>${obj[key]}</td></tr>`;
    }
  }
  return `<table class="data-table">
    <thead>
      <tr><th>Clave</th><th>Valor</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

// Función que genera el HTML completo del reporte
function generateHTMLReport(data) {
  // Extraer los contadores del aggregate para construir los gráficos
  const counters = data.aggregate.counters || {};
  const counterLabels = Object.keys(counters);
  const counterValues = Object.values(counters);

  // Colores predefinidos (se asignarán dinámicamente)
  const presetColors = [
    'rgba(255, 99, 132, 0.8)',
    'rgba(54, 162, 235, 0.8)',
    'rgba(255, 206, 86, 0.8)',
    'rgba(75, 192, 192, 0.8)',
    'rgba(153, 102, 255, 0.8)',
    'rgba(255, 159, 64, 0.8)',
    'rgba(199, 199, 199, 0.8)',
    'rgba(83, 102, 255, 0.8)',
    'rgba(255, 102, 255, 0.8)',
    'rgba(102, 255, 102, 0.8)'
  ];
  const barColors = counterLabels.map((_, index) => presetColors[index % presetColors.length]);
  const borderColors = barColors.map(color => color.replace(/0\.8/, '1'));

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte de Rendimiento de Artillery</title>
  <!-- Tipografía moderna -->
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    /* Estilos generales para el reporte */
    body {
      margin: 10px;
      padding: 10px;
      font-family: 'Poppins', sans-serif;
      background-color: #121212;
      color: #e0e0e0;
      line-height: 1.4;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    h1, h2, h3, h4, h5 {
      color: #ffffff;
      text-align: center;
      margin: 8px 0;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 5px;
      margin-bottom: 15px;
    }
    /* Distribución de tablas en dos columnas en Resultados Agregados */
    .table-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 15px;
    }
    /* Tablas centradas y con ancho reducido */
    .data-table {
      width: 90%;
      border-collapse: collapse;
      font-size: 0.85em;
      margin: 0 auto 30px;
    }
    .data-table th, .data-table td {
      border: 1px solid #333;
      padding: 6px;
      text-align: left;
    }
    .data-table th {
      background-color: #333;
    }
    a {
      color: #64b5f6;
      text-decoration: none;
    }
    /* Contenedor para los gráficos centrado */
    .charts-row {
      display: flex;
      width: 90%;
      margin: 20px auto 0;
      justify-content: space-between;
    }
    /* Cada contenedor de gráfico ahora ocupa el 46% y es cuadrado */
    .chart-container {
      width: 46%;
      aspect-ratio: 1 / 1;
      position: relative;
      padding: 10px;
      box-sizing: border-box;
      background-color: #1e1e1e;
      border-radius: 8px;
    }
    .chart-container h3 {
      margin: 0 0 10px;
      font-size: 1.2em;
      font-weight: 600;
    }
    .chart-container canvas {
      position: absolute;
      top: 50px;
      left: 0;
      width: 100% !important;
      height: calc(100% - 50px) !important;
    }
    /* Sección de segmentos: los segmentos ocuparán el 100% y se apilarán verticalmente */
    .segments-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
      margin: 0 auto;
      width: 100%;
    }
    .segment-card {
      background-color: #1e1e1e;
      border-radius: 8px;
      padding: 15px;
      box-sizing: border-box;
      margin-bottom: 15px;
    }
    .segment-card h3 {
      margin-bottom: 10px;
      font-size: 1.2em;
      font-weight: 600;
      text-align: center;
    }
    .segment-card p {
      text-align: center;
      margin-bottom: 10px;
    }
    /* Dentro de cada segmento, las tablas se muestran en bloque, ocupando el 100% */
    .segment-table-grid {
      display: block;
      width: 100%;
      margin-bottom: 15px;
    }
    /* Footer */
    footer {
      margin-top: auto;
      padding: 10px;
      text-align: center;
      border-top: 1px solid #333;
      font-size: 0.9em;
    }
    /* Adaptabilidad en pantallas pequeñas */
    @media (max-width: 600px) {
      .table-grid {
        grid-template-columns: 1fr;
      }
      .charts-row {
        flex-direction: column;
        align-items: center;
      }
      .chart-container {
        width: 90%;
        margin-bottom: 20px;
      }
    }
  </style>
  <!-- Incluir Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>Reporte de Rendimiento de Artillery</h1>
  <p style="text-align:center;">Fecha: ${new Date().toLocaleString()}</p>

  <!-- Sección de Resultados Agregados -->
  <div class="section">
    <h2 class="section-title">Resultados Agregados</h2>
    <div class="table-grid">
      <div>
        <h3>Counters</h3>
        ${renderObjectTable(data.aggregate.counters)}
      </div>
      <div>
        <h3>Resumen de <code>vusers.session_length</code></h3>
        ${data.aggregate.summaries && data.aggregate.summaries["vusers.session_length"]
          ? renderObjectTable(data.aggregate.summaries["vusers.session_length"])
          : '<p>No hay resumen disponible.</p>'}
      </div>
    </div>
    <div class="charts-row">
      <div class="chart-container">
        <h3>Gráfico de Barras</h3>
        <canvas id="countersBarChart"></canvas>
      </div>
      <div class="chart-container">
        <h3>Gráfico de Torta</h3>
        <canvas id="countersPieChart"></canvas>
      </div>
    </div>
  </div>

  <!-- Sección de Resultados Intermedios (Segmentos) -->
  <div class="section">
    <h2 class="section-title">Resultados Intermedios</h2>
    <div class="segments-grid">
      ${data.intermediate
        .map((item, index) => {
          return `<div class="segment-card">
            <h3>Segmento ${index + 1}</h3>
            <p><strong>Periodo:</strong> ${new Date(parseInt(item.period)).toLocaleString()}</p>
            <div class="segment-table-grid">
              <h4>Counters</h4>
              ${renderObjectTable(item.counters)}
            </div>
            <div class="segment-table-grid">
              <h4>Summaries</h4>
              ${item.summaries && Object.keys(item.summaries).length > 0
                ? Object.keys(item.summaries)
                    .map(key => `<h5>${key}</h5>${renderObjectTable(item.summaries[key])}`)
                    .join('')
                : '<p>No hay summaries disponibles.</p>'}
            </div>
            <div class="segment-table-grid">
              <h4>Histograms</h4>
              ${item.histograms && Object.keys(item.histograms).length > 0
                ? Object.keys(item.histograms)
                    .map(key => `<h5>${key}</h5>${renderObjectTable(item.histograms[key])}`)
                    .join('')
                : '<p>No hay histograms disponibles.</p>'}
            </div>
          </div>`;
        })
        .join('')}
    </div>
  </div>

  <!-- Footer -->
  <footer>
    Desarrollado por <a href="https://qarmy.ar" target="_blank">QARMY</a> &amp; <a href="https://underc0de.org" target="_blank">Underc0de</a>
  </footer>

  <script>
    //Datos para los gráficos
    const counterLabels = ${JSON.stringify(counterLabels)};
    const counterValues = ${JSON.stringify(counterValues)};
    const barColors = ${JSON.stringify(barColors)};
    const borderColors = ${JSON.stringify(borderColors)};

    // Configuración del gráfico de barras
    const barCtx = document.getElementById('countersBarChart').getContext('2d');
    new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: counterLabels,
        datasets: [{
          label: 'Valor',
          data: counterValues,
          backgroundColor: barColors,
          borderColor: borderColors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#e0e0e0',
              font: { family: 'Poppins', size: 14 }
            }
          },
          tooltip: {
            backgroundColor: '#333',
            titleColor: '#fff',
            bodyColor: '#fff',
            bodyFont: { family: 'Poppins', size: 12 }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#e0e0e0',
              font: { family: 'Poppins', size: 12 }
            },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#e0e0e0',
              font: { family: 'Poppins', size: 12 }
            },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        }
      }
    });

    // Configuración del gráfico de torta (Pie Chart)
    const pieCtx = document.getElementById('countersPieChart').getContext('2d');
    new Chart(pieCtx, {
      type: 'pie',
      data: {
        labels: counterLabels,
        datasets: [{
          data: counterValues,
          backgroundColor: barColors,
          borderColor: borderColors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#e0e0e0',
              font: { family: 'Poppins', size: 14 }
            }
          },
          tooltip: {
            backgroundColor: '#333',
            titleColor: '#fff',
            bodyColor: '#fff',
            bodyFont: { family: 'Poppins', size: 12 }
          }
        }
      }
    });
  </script>
</body>
</html>`;
}

const inputPath = path.join(__dirname, 'report.json');
const outputPath = path.join(__dirname, 'performance-report.html');

fs.readFile(inputPath, 'utf8', (err, jsonString) => {
  if (err) {
    console.error("Error al leer el archivo JSON:", err);
    return;
  }
  try {
    const data = JSON.parse(jsonString);
    const html = generateHTMLReport(data);
    fs.writeFile(outputPath, html, err => {
      if (err) {
        console.error("Error al escribir el reporte HTML:", err);
      } else {
        console.log("Reporte HTML generado correctamente en:", outputPath);
      }
    });
  } catch (err) {
    console.error("Error al parsear el JSON:", err);
  }
});
