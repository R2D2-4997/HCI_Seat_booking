// ============================================================
// Construction de la grille (matrice) à partir des sièges extraits
// Responsable : Personne 1 (à terme côté backend, Personne 2)
// ============================================================

// 6. RECONSTRUCTION MATRICIELLE
function buildDynamicLayout(seats) {
  if (!seats || seats.length === 0) return null;

  const detectedRows = seats.map(s => s.row);
  const minRow = Math.min(...detectedRows);
  const maxRow = Math.max(...detectedRows);

  const rows = [];
  for (let r = minRow; r <= maxRow; r++) rows.push(r);

  const letters = [...new Set(seats.map(s => s.letter))].sort();

  const colStructure = [];
  for (let i = 0; i < letters.length; i++) {
    colStructure.push(letters[i]);
    if (i < letters.length - 1) {
      const currentCode = letters[i].charCodeAt(0);
      const nextCode = letters[i + 1].charCodeAt(0);
      if (nextCode - currentCode > 1) {
        colStructure.push("");
      }
    }
  }

  const matrix = [];
  const seatsMetadata = {};
  const seatElements = {};

  rows.forEach((rNum, rIdx) => {
    const rowLine = [];
    colStructure.forEach((lettr, cIdx) => {
      const key = `${rIdx},${cIdx}`;

      if (lettr === "") {
        rowLine.push(0);
        return;
      }

      const seatObj = seats.find(s => s.row === rNum && s.letter === lettr);
      if (seatObj) {
        const statusCode = seatObj.status === "occupied" ? 2 : 1;
        rowLine.push(statusCode);

        seatsMetadata[key] = {
          id: seatObj.id,
          type: "Standard",
          price: seatObj.price || (seatObj.status === "occupied" ? "Indisponible" : "Disponible"),
          status: seatObj.status
        };
        seatElements[key] = seatObj.element;
      } else {
        rowLine.push(2);
        seatsMetadata[key] = {
          id: `${rNum}${lettr}`,
          type: "Indisponible",
          price: "Indisponible",
          status: "occupied"
        };
      }
    });
    matrix.push(rowLine);
  });

  return {
    rows: rows.length,
    cols: colStructure.length,
    matrix: matrix,
    seatsMetadata: seatsMetadata,
    seatElements: seatElements
  };
}
