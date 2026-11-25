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
 * Each seat uses 4x4 pins: a 3x3 shape, then one empty row and column so
 * that neighbouring seats never touch. An aisle (a column of 0) is therefore
 * 4 empty pins, plus the empty column of the seat before it.
 *
 * The seat shapes: solid square = available, diagonal = occupied,
 * hollow square = selected, cross = cursor.
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
  // Available: solid 3x3 square (9 pins), the most common and the fullest shape.
  1: [
    [1, 1, 1, 0],
    [1, 1, 1, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0]
  ],
  // Occupied: anti-diagonal (3 pins).
  2: [
    [0, 0, 1, 0],
    [0, 1, 0, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // Selected: hollow square (8 pins), an available seat "marked as mine".
  3: [
    [1, 1, 1, 0],
    [1, 0, 1, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0]
  ],
  // Landmark: not produced by the extraction yet, shape still to be designed.
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

// The cursor is a cross (5 pins), like a viewfinder: a shape no seat uses.
// It replaces the pattern of the seat it is on: the voice says whether that
// seat is available or not.
const CURSOR_PATTERN = [
  [0, 1, 0, 0],
  [1, 1, 1, 0],
  [0, 1, 0, 0],
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

// Pins taken by the plane walls: left wall + one empty pin, and the right wall
// (on the right, the last seat's own empty column already gives the gap).
const WALLS_WIDTH = 3;

// Number of seats that fit on the device, in rows and columns.
export function seatCapacity(cellRows = DEFAULT_CELL_ROWS, cellColumns = DEFAULT_CELL_COLUMNS) {
  return {
    rows: Math.floor((cellRows * 4) / PATTERN_SIZE),
    cols: Math.floor((cellColumns * 2 - WALLS_WIDTH) / PATTERN_SIZE)
  };
}

// Adds the plane walls (window side): a continuous vertical line one empty pin
// away from the seats. A wall is only drawn on a real edge of the plane, so a
// section cut in width stays open on the side where the plane continues.
function addPlaneWalls(pins, leftWall, rightWall) {
  // The last pin row is the empty row below the last seats: no wall there.
  const wallHeight = pins.length - 1;

  return pins.map((row, y) => {
    const isWall = y < wallHeight;
    return [isWall && leftWall ? 1 : 0, 0, ...row, isWall && rightWall ? 1 : 0];
  });
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
// Defaults match what fits on a 30x10-cell Dot Pad (10 rows x 14 seats).
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

  const rawPins = addPlaneWalls(
    convertSeatMap(section.matrix, localCursor),
    section.startCol === 0,
    section.startCol + section.cols === matrix[0].length
  );

  // Center the seat map horizontally and vertically inside the Dot Pad display.
  const targetWidth = cellColumns * 2;
  const targetHeight = cellRows * 4;
  const padLeft = Math.max(0, Math.floor((targetWidth - (rawPins[0]?.length || 0)) / 2));
  const padTop = Math.max(0, Math.floor((targetHeight - rawPins.length) / 2));
  const emptyRow = () => Array(targetWidth).fill(0);
  const pins = [
    ...Array.from({ length: padTop }, emptyRow),
    ...rawPins.map(row => [...Array(padLeft).fill(0), ...row])
  ];

  return {
    hex: pinsToHex(pins, cellRows, cellColumns),
    section,
    sectionCount: sections.length,
    sectionRows: capacity.rows
  };
}

// Test image: a frame around the whole display plus a diagonal from the
// top-left to the bottom-right corner. If the frame looks broken on the device, fix DOT_BITS.
export function buildTestFrame(cellRows = DEFAULT_CELL_ROWS, cellColumns = DEFAULT_CELL_COLUMNS) {
  const height = cellRows * 4;
  const width = cellColumns * 2;
  const pins = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      (y === 0 || y === height - 1 || x === 0 || x === width - 1) ? 1 : 0
    )
  );

  // The display is wider than tall (60 x 40 pins): one pin per step along the
  // longer side, so the line reaches the opposite corner without gaps.
  const steps = Math.max(width, height) - 1;
  for (let i = 0; i <= steps; i++) {
    pins[Math.round(i * (height - 1) / steps)][Math.round(i * (width - 1) / steps)] = 1;
  }

  return pinsToHex(pins, cellRows, cellColumns);
}

// Pattern sample: a small 3-3 plane (seats A-C, aisle, seats D-F, 4 rows),
// to check that the seat types can be told apart by touch.
// Selected seat on D2, cursor on D3.
const SAMPLE_PLANE = [
  [1, 1, 1, 0, 1, 2, 1],
  [1, 2, 1, 0, 3, 1, 1],
  [1, 1, 2, 0, 1, 1, 1],
  [2, 1, 1, 0, 1, 1, 2]
];

export function buildPatternSampleFrame(cellRows = DEFAULT_CELL_ROWS, cellColumns = DEFAULT_CELL_COLUMNS) {
  return buildFrame(SAMPLE_PLANE, { r: 2, c: 4 }, cellRows, cellColumns).hex;
}

// Unpacks a hexadecimal string back into a 2D pin grid (width = cellColumns * 2, height = cellRows * 4).
export function hexToPins(hex, cellRows = DEFAULT_CELL_ROWS, cellColumns = DEFAULT_CELL_COLUMNS) {
  const clean = (hex || "").replace(/\s+/g, "").toUpperCase();
  const height = cellRows * 4;
  const width = cellColumns * 2;
  const pins = Array.from({ length: height }, () => Array(width).fill(0));

  for (let line = 0; line < cellRows; line++) {
    for (let cell = 0; cell < cellColumns; cell++) {
      const idx = (line * cellColumns + cell) * 2;
      const byte = parseInt(clean.slice(idx, idx + 2), 16) || 0;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 2; x++) {
          if (byte & DOT_BITS[y][x]) {
            pins[line * 4 + y][cell * 2 + x] = 1;
          }
        }
      }
    }
  }
  return pins;
}
