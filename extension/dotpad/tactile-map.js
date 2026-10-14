// ============================================================
// Conversion de la matrice de sièges en picots pour le Dot Pad
// Responsable : Personne 3
// ============================================================

/**
 * Converts a seat map into a grid of tactile pins.
 *
 * Seat values (format v2):
 * 0 = aisle / empty
 * 1 = available
 * 2 = occupied
 * 3 = selected
 * 4 = landmark (exit, toilets, door...)
 * 5 = structure (wall, stage, driver)
 *
 * Each seat uses 4x4 pins (= 2 Dot Pad cells). The last row and column
 * always stay empty so that neighbouring seats never touch, even the cursor.
 * To adjust after testing on the real device, only edit PATTERNS.
 */

const PATTERN_SIZE = 4;

// Defines the tactile pattern for each seat type.
const PATTERNS = {
  0: [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // Available: small solid square, the easiest shape to find.
  1: [
    [1, 1, 0, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // Occupied: a single pin.
  2: [
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // Selected: diagonal.
  3: [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 0]
  ],
  // Landmark: horizontal bar.
  4: [
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // Structure: full-width line, so walls form a continuous line.
  5: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]
};

// The cursor is the only big 3x3 square on the display.
const CURSOR_PATTERN = [
  [1, 1, 1, 0],
  [1, 1, 1, 0],
  [1, 1, 1, 0],
  [0, 0, 0, 0]
];

// Default Dot Pad graphic area: 30 cells x 10 lines, each cell = 2x4 pins.
export const DEFAULT_CELL_COLUMNS = 30;
export const DEFAULT_CELL_ROWS = 10;

// Bit of each pin inside a cell byte, indexed [pinRow][pinCol].
// Left column = bits 0-3 (top to bottom), right column = bits 4-7.
// If the image looks scrambled on the device, this table is the only thing to fix.
const DOT_BITS = [
  [0x01, 0x10],
  [0x02, 0x20],
  [0x04, 0x40],
  [0x08, 0x80]
];

function validateMatrix(matrix) {
  if (
    !Array.isArray(matrix) ||
    matrix.length === 0 ||
    !Array.isArray(matrix[0]) ||
    matrix[0].length === 0
  ) {
    throw new Error("Invalid seat map.");
  }

  const columns = matrix[0].length;
  if (matrix.some(row => !Array.isArray(row) || row.length !== columns)) {
    throw new Error("Inconsistent row length.");
  }
}

// Number of seats that fit on the device, in rows and columns.
export function seatCapacity(cellRows = DEFAULT_CELL_ROWS, cellColumns = DEFAULT_CELL_COLUMNS) {
  return {
    rows: Math.floor((cellRows * 4) / PATTERN_SIZE),
    cols: Math.floor((cellColumns * 2) / PATTERN_SIZE)
  };
}

// Converts the backend matrix into a binary tactile grid.
// `cursor` ({ r, c }) is optional and relative to `matrix`.
export function convertSeatMap(matrix, cursor = null) {
  validateMatrix(matrix);

  const tactileGrid = [];

  // Converts each seat row into three rows of tactile pins.
  matrix.forEach((row, r) => {
    const tactileRows = Array.from({ length: PATTERN_SIZE }, () => []);

    row.forEach((seat, c) => {
      const isCursor = cursor && cursor.r === r && cursor.c === c;
      const pattern = isCursor ? CURSOR_PATTERN : PATTERNS[seat];

      if (!pattern) {
        throw new Error(`Unknown seat type: ${seat}`);
      }

      // Adds the seat pattern to the current tactile rows.
      for (let i = 0; i < PATTERN_SIZE; i++) {
        tactileRows[i].push(...pattern[i]);
      }
    });

    tactileGrid.push(...tactileRows);
  });

  return tactileGrid;
}

// Splits a large seat map into smaller sections.
// Defaults match what fits on a 30x10-cell Dot Pad (13 rows x 20 seats).
export function segmentSeatMap(matrix, maxRows = seatCapacity().rows, maxCols = seatCapacity().cols) {
  validateMatrix(matrix);

  if (!Number.isInteger(maxRows) || maxRows <= 0 ||
      !Number.isInteger(maxCols) || maxCols <= 0) {
    throw new Error("Invalid section dimensions.");
  }

  const totalRows = matrix.length;
  const totalCols = matrix[0].length;
  const sections = [];

  // Iterates through the map in rectangular sections.
  for (let row = 0; row < totalRows; row += maxRows) {
    for (let col = 0; col < totalCols; col += maxCols) {

      // Extracts the seats belonging to the current section.
      const sectionMatrix = matrix
        .slice(row, row + maxRows)
        .map(r => r.slice(col, col + maxCols));

      sections.push({
        id: sections.length,
        startRow: row,
        startCol: col,
        rows: sectionMatrix.length,
        cols: sectionMatrix[0].length,
        matrix: sectionMatrix
      });
    }
  }

  return sections;
}

// Returns the section that contains the cursor (first section by default).
export function findSectionForCursor(sections, cursor) {
  if (!cursor) return sections[0];

  return sections.find(s =>
    cursor.r >= s.startRow && cursor.r < s.startRow + s.rows &&
    cursor.c >= s.startCol && cursor.c < s.startCol + s.cols
  ) || sections[0];
}

// Packs a pin grid into the hexadecimal string expected by displayGraphicData():
// one byte per cell, cells ordered line by line. The grid is cropped or padded
// with lowered pins to the device size.
export function pinsToHex(pins, cellRows = DEFAULT_CELL_ROWS, cellColumns = DEFAULT_CELL_COLUMNS) {
  let hex = "";

  for (let line = 0; line < cellRows; line++) {
    for (let cell = 0; cell < cellColumns; cell++) {
      let byte = 0;

      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 2; x++) {
          if (pins[line * 4 + y]?.[cell * 2 + x]) {
            byte |= DOT_BITS[y][x];
          }
        }
      }

      hex += byte.toString(16).padStart(2, "0").toUpperCase();
    }
  }

  return hex;
}

// Builds everything needed to display the seat map around the cursor.
export function buildFrame(matrix, cursor, cellRows = DEFAULT_CELL_ROWS, cellColumns = DEFAULT_CELL_COLUMNS) {
  const capacity = seatCapacity(cellRows, cellColumns);
  const sections = segmentSeatMap(matrix, capacity.rows, capacity.cols);
  const section = findSectionForCursor(sections, cursor);

  const localCursor = cursor
    ? { r: cursor.r - section.startRow, c: cursor.c - section.startCol }
    : null;

  const pins = convertSeatMap(section.matrix, localCursor);

  return {
    hex: pinsToHex(pins, cellRows, cellColumns),
    section,
    sectionCount: sections.length,
    sectionRows: capacity.rows
  };
}

// Test image: a frame around the whole display plus a diagonal from the
// top-left corner. If the frame looks broken on the device, fix DOT_BITS.
export function buildTestFrame(cellRows = DEFAULT_CELL_ROWS, cellColumns = DEFAULT_CELL_COLUMNS) {
  const height = cellRows * 4;
  const width = cellColumns * 2;
  const pins = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      (y === 0 || y === height - 1 || x === 0 || x === width - 1 || x === y) ? 1 : 0
    )
  );

  return pinsToHex(pins, cellRows, cellColumns);
}
