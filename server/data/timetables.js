// periods: 1..9. class=null means FREE.
// Classes: 6A–6I, 7A–7H, 8A–8G.
const timetables = [
  {
    teacherId: 1,
    day: "Monday",
    periods: [
      { period: 1, class: "7A" },
      { period: 2, class: null },
      { period: 3, class: "6I" },
      { period: 4, class: null },
      { period: 5, class: "6C" },
      { period: 6, class: null },
      { period: 7, class: "8B" },
      { period: 8, class: null },
      { period: 9, class: "7H" }
    ]
  },
  {
    teacherId: 2,
    day: "Monday",
    periods: [
      { period: 1, class: null },
      { period: 2, class: "7B" },
      { period: 3, class: null },
      { period: 4, class: "6I" },
      { period: 5, class: null },
      { period: 6, class: "6D" },
      { period: 7, class: null },
      { period: 8, class: "8F" },
      { period: 9, class: null }
    ]
  },
  {
    teacherId: 3,
    day: "Monday",
    periods: [
      { period: 1, class: "6A" },
      { period: 2, class: null },
      { period: 3, class: "7H" },
      { period: 4, class: null },
      { period: 5, class: "7C" },
      { period: 6, class: null },
      { period: 7, class: "8A" },
      { period: 8, class: null },
      { period: 9, class: null }
    ]
  },
  {
    teacherId: 4,
    day: "Monday",
    periods: [
      { period: 1, class: null },
      { period: 2, class: "6B" },
      { period: 3, class: null },
      { period: 4, class: "6H" },
      { period: 5, class: null },
      { period: 6, class: "7D" },
      { period: 7, class: null },
      { period: 8, class: "8C" },
      { period: 9, class: "6I" }
    ]
  },
  // Extra staff to ensure multiple free candidates for fairness testing
  {
    teacherId: 5,
    day: "Monday",
    periods: [
      { period: 1, class: null },
      { period: 2, class: "6E" },
      { period: 3, class: "7E" },
      { period: 4, class: null },
      { period: 5, class: null },
      { period: 6, class: "8D" },
      { period: 7, class: null },
      { period: 8, class: null },
      { period: 9, class: "7F" }
    ]
  },
  {
    teacherId: 6,
    day: "Monday",
    periods: [
      { period: 1, class: "6F" },
      { period: 2, class: null },
      { period: 3, class: null },
      { period: 4, class: "8E" },
      { period: 5, class: null },
      { period: 6, class: null },
      { period: 7, class: "7G" },
      { period: 8, class: null },
      { period: 9, class: null }
    ]
  },
  {
    teacherId: 7,
    day: "Monday",
    periods: [
      { period: 1, class: null },
      { period: 2, class: "8G" },
      { period: 3, class: null },
      { period: 4, class: null },
      { period: 5, class: "6G" },
      { period: 6, class: null },
      { period: 7, class: "8G" },
      { period: 8, class: "7A" },
      { period: 9, class: null }
    ]
  },
  {
    teacherId: 8,
    day: "Monday",
    periods: [
      { period: 1, class: "7H" },
      { period: 2, class: null },
      { period: 3, class: null },
      { period: 4, class: "6H" },
      { period: 5, class: null },
      { period: 6, class: null },
      { period: 7, class: "8B" },
      { period: 8, class: null },
      { period: 9, class: null }
    ]
  },
  {
    teacherId: 9,
    day: "Monday",
    periods: [
      { period: 1, class: null },
      { period: 2, class: null },
      { period: 3, class: "6I" },
      { period: 4, class: null },
      { period: 5, class: "7B" },
      { period: 6, class: null },
      { period: 7, class: null },
      { period: 8, class: null },
      { period: 9, class: "8F" }
    ]
  },
  {
    teacherId: 10,
    day: "Monday",
    periods: [
      { period: 1, class: null },
      { period: 2, class: "6H" },
      { period: 3, class: null },
      { period: 4, class: null },
      { period: 5, class: null },
      { period: 6, class: "6A" },
      { period: 7, class: null },
      { period: 8, class: "7C" },
      { period: 9, class: null }
    ]
  }
];

module.exports = { timetables };

