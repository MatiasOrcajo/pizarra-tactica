# Arquitectura de la Pizarra Táctica (Aplicación Web - Vercel)

## 1. Separación de Responsabilidades (Frontend)

El proyecto debe dividirse estrictamente en tres capas que se comunican en una sola dirección:

- **La Capa UI (Interfaz):** Vue 3. Se encarga exclusivamente de los botones, formularios y selectores de herramientas. La UI **jamás** interactúa directamente con el Canvas. Debe diseñarse de forma responsiva para ser accesible desde cualquier tamaño de pantalla.
- **La Capa de Estado (Store):** Pinia. Es el cerebro de la aplicación. Mantiene un array de objetos JSON con todos los elementos de la pizarra (coordenadas X/Y, tipo de forma, color, nombre del jugador).
- **La Capa de Renderizado (Canvas):** Konva.js. Simplemente "escucha" los cambios en el Store y dibuja las figuras en pantalla. Implementa un `ResizeObserver` para escalar el contenido dinámicamente según el tamaño de la ventana del navegador en el dispositivo actual.

## 2. Persistencia de Datos (APIs del Navegador Web)

Al no haber base de datos ni backend nativo, toda la gestión de guardado ocurre en el cliente (Browser).

- **Guardado en Caché (Autosave):** El estado de Pinia debe sincronizarse automáticamente con el `localStorage` del navegador. Así, si la pestaña se cierra por accidente, la táctica actual no se pierde.
- **Exportar Táctica (Descargar):** La aplicación convierte el estado de Pinia a un string JSON, crea un `Blob` de datos y genera una descarga automática en el dispositivo usando un elemento `<a>` con el atributo `download` (ej: `tactica_01.json`).
- **Importar Táctica (Cargar):** A través de un `<input type="file">`, la aplicación utiliza la `FileReader API` nativa del navegador para leer un archivo JSON previamente exportado y reemplaza por completo el estado actual de Pinia.

## 3. Diagrama de Flujo

```mermaid
graph TD
    UI[Barra de Herramientas UI] -->|Modifica datos| Store[(Store Central en Memoria - Pinia)]
    Store -->|Se dibuja automáticamente| Konva[Motor Gráfico - Konva.js]
    Store <-->|Sincronización automática| LocalStorage[localStorage del Navegador]
    UI -->|Importar archivo .json| FileReader[Browser FileReader API]
    FileReader -->|Reemplaza estado| Store
    Store -->|Exportar Blob JSON| Download[Descarga al Dispositivo]