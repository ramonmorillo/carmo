// Sugerencias para el modelo CMO cardiovascular a partir de datos ya registrados. Son ayudas: el
// farmacéutico confirma cada respuesta. Donde las tablas del modelo dejan huecos o solapamientos no se
// sugiere nada (docs/CARMO_CMO_MODEL.md §4).

export type Suggestion = { value: string; basis: string } | { value: null; basis: string };

export function suggestAgeGroup(age: number | null | undefined): Suggestion | null {
  if (age === null || age === undefined) return null;
  if (age < 18) return { value: 'under_18', basis: `${age} años` };
  if (age === 18) return { value: null, basis: '18 años: el modelo define «< 18» y «19-49»; elegir manualmente' };
  if (age <= 49) return { value: '19_49', basis: `${age} años` };
  if (age <= 69) return { value: '50_69', basis: `${age} años` };
  return { value: '70_plus', basis: `${age} años` };
}

export function suggestNutritionalStatus(bmi: number | null | undefined): Suggestion | null {
  if (bmi === null || bmi === undefined) return null;
  const b = `IMC ${bmi}`;
  if (bmi < 18.4) return { value: 'undernutrition', basis: b };
  if (bmi < 18.5) return { value: null, basis: `${b}: entre las categorías del modelo (< 18,4 y 18,5-24,9)` };
  if (bmi <= 24.9) return { value: 'normal', basis: b };
  if (bmi < 25) return { value: null, basis: `${b}: entre las categorías del modelo (24,9 y 25)` };
  if (bmi <= 30) return { value: 'overweight', basis: b };
  if (bmi < 40) return { value: 'obesity', basis: b };
  if (bmi === 40) return { value: null, basis: `${b}: el modelo define «< 40» y «> 40»` };
  return { value: 'severe_obesity', basis: b };
}

export function suggestPolypharmacy(activeIngredients: number | null | undefined): Suggestion | null {
  if (activeIngredients === null || activeIngredients === undefined) return null;
  const b = `${activeIngredients} principios activos registrados como activos en CARMO (revisar si el registro de tratamientos está completo)`;
  if (activeIngredients < 7) return { value: 'lt_7', basis: b };
  if (activeIngredients < 10) return { value: '7_10', basis: b };
  if (activeIngredients === 10) return { value: null, basis: `${b}: 10 está en «7-10» y en «≥ 10»` };
  return { value: '10_plus', basis: b };
}

export function suggestTobacco(tobaccoUse: boolean | null | undefined, yearsSinceQuitting: number | null | undefined): Suggestion | null {
  if (tobaccoUse === true) return { value: 'current', basis: 'Consumo de tabaco: sí' };
  if (tobaccoUse !== false) return null;
  if (yearsSinceQuitting === null || yearsSinceQuitting === undefined) return { value: null, basis: 'No fuma; falta «años sin fumar» para distinguir exfumador reciente' };
  if (yearsSinceQuitting < 5) return { value: 'former_5y', basis: `Exfumador hace ${yearsSinceQuitting} años` };
  if (yearsSinceQuitting === 5) return { value: null, basis: 'Exfumador hace 5 años: límite «últimos 5 años»; elegir manualmente' };
  return { value: 'no', basis: `Exfumador hace ${yearsSinceQuitting} años` };
}

export function suggestYes(flag: boolean | null | undefined, basis: string): Suggestion | null {
  return flag === true ? { value: 'yes', basis } : null;
}
