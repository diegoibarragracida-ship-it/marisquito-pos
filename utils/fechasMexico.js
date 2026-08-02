// El servidor (Render) corre en UTC, pero el negocio opera en horario de
// Ciudad de México (UTC-6 todo el año desde que México quitó el horario de
// verano en 2022). Sin esto, "el día de hoy" se calculaba en UTC — lo que
// recortaba las últimas 6 horas de cada día real (tarde/noche) y las metía
// en el día siguiente. Por eso el corte y el historial se veían mal.

const OFFSET_HORAS_MEXICO = 6;

// Medianoche de "hoy" (o de la fecha que se le pase) en hora de México,
// devuelta como un Date real en UTC que representa ese instante exacto.
function inicioDiaMexico(fechaBase = new Date()) {
  const corrida = new Date(fechaBase.getTime() - OFFSET_HORAS_MEXICO * 3600 * 1000);
  corrida.setUTCHours(0, 0, 0, 0);
  return new Date(corrida.getTime() + OFFSET_HORAS_MEXICO * 3600 * 1000);
}

// Clave "YYYY-MM-DD" del día en México al que pertenece una fecha (para agrupar
// ventas/gastos por día correctamente, sin que se corran de fecha por UTC).
function claveDiaMexico(fecha) {
  const corrida = new Date(new Date(fecha).getTime() - OFFSET_HORAS_MEXICO * 3600 * 1000);
  return corrida.toISOString().slice(0, 10);
}

module.exports = { inicioDiaMexico, claveDiaMexico, OFFSET_HORAS_MEXICO };
