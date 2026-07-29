# Arquitectura de la Pizarra Táctica (Standalone Windows)

## 1. Separación de Responsabilidades (Frontend)

El proyecto debe dividirse estrictamente en tres capas que se comunican en una sola dirección:

- **La Capa UI (Interfaz):** Vue 3. Se encarga exclusivamente de los botones, formularios y selectores de herramientas. La UI **jamás** interactúa directamente con el Canvas.
- **La Capa de Estado (Store):** Pinia. Es el cerebro de la aplicación. Mantiene un array de objetos JSON con todos los elementos de la pizarra (coordenadas X/Y, tipo de forma, color, nombre del jugador).
- **La Capa de Renderizado (Canvas):** Konva.js. Simplemente "escucha" los cambios en el Store y dibuja las figuras en pantalla. Implementa un `ResizeObserver` para escalar el contenido según el tamaño de la ventana de Windows.

## 2. Persistencia de Datos (Backend Nativo)

No hay base de datos (ni SQLite, ni Postgres). Todo el guardado es local a través del sistema de archivos de Windows.

- **Guardar:** El proceso principal (Electron/Tauri) recibe el estado actual del Store, lo convierte a un string JSON y abre el diálogo nativo de Windows para guardarlo como un archivo (ej: `tactica_01.json`).
- **Cargar:** El proceso principal lee un archivo JSON del disco duro y reemplaza todo el estado actual del Store con esa nueva información.

## 3. Diagrama de Flujo

```mermaid
graph TD
    UI[Barra de Herramientas UI] -->|Modifica datos| Store[(Store Central en Memoria)]
    Store -->|Se dibuja automáticamente| Konva[Motor Gráfico - Konva.js]
    Store <-->|Serialización JSON| Windows[Proceso Main - Electron/Tauri]
    Windows <-->|Lectura/Escritura| Disco[Disco Duro Local Windows]