export function add(a, b) {
  return a + b;
}

// BUG: subtraction implemented as addition — the unit test catches this.
export function subtract(a, b) {
  return a + b;
}

export function multiply(a, b) {
  return a * b;
}
