
/**
 * Converts a seat map into a grid of tactile pins.
 *
 * Seat values:
 * 0 = aisle
 * 1 = available
 * 2 = occupied
 */

// Defines the tactile pattern for each seat type.
const PATTERNS = {
  0: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ],
  1: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  2: [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1]
  ]
};

// Converts the backend matrix into a binary tactile grid.
export function convertSeatMap(matrix) {
  if (
    !Array.isArray(matrix) ||
    matrix.length === 0 ||
    !Array.isArray(matrix[0]) ||
    matrix[0].length === 0
  ) {
    throw new Error("Invalid seat map.");
  }

  const columns = matrix[0].length;
  const tactileGrid = [];

  // Converts each seat row into three rows of tactile pins.
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new Error("Inconsistent row length.");
    }

    const tactileRows = [[], [], []];

    for (const seat of row) {
      const pattern = PATTERNS[seat];

      if (!pattern) {
        throw new Error(`Unknown seat type: ${seat}`);
      }

      // Adds the seat pattern to the current tactile rows.
      for (let i = 0; i < 3; i++) {
        tactileRows[i].push(...pattern[i]);
      }
    }

    tactileGrid.push(...tactileRows);
  }
  

  return tactileGrid;
}

// Splits a large seat map into smaller sections.
export function segmentSeatMap(matrix, maxRows = 3, maxCols = 5) {

  // Validates the matrix and the section dimensions.
  if (!Array.isArray(matrix) || matrix.length === 0 ||
      !Array.isArray(matrix[0]) || matrix[0].length === 0) {
    throw new Error("Invalid seat map.");
  }

  if (!Number.isInteger(maxRows) || maxRows <= 0 ||
      !Number.isInteger(maxCols) || maxCols <= 0) {
    throw new Error("Invalid section dimensions.");
  }

  const totalRows = matrix.length;
  const totalCols = matrix[0].length;

  if (matrix.some(row =>
    !Array.isArray(row) || row.length !== totalCols
  )) {
    throw new Error("Inconsistent row length.");
  }

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
