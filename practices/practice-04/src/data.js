// Исходные наборы задач. Только данные, без логики изменения.

export const demoTasks = [
  { id: 1, title: "Изучить функции", completed: true, priority: "medium" },
  { id: 4, title: "Подготовить модель задач", completed: false, priority: "high" },
  { id: 7, title: "Проверить методы массивов", completed: false, priority: "low" },
  { id: 10, title: "Оформить README", completed: true, priority: "medium" },
];

export const variantNumber = 6;

// Вариант 6 — «Проверка пользовательского интерфейса».
// Первые 5 задач выполнены, последняя — нет.
export const variantTasks = [
  { id: 11, title: "Составить план проверки интерфейса", completed: true, priority: "high" },
  { id: 23, title: "Проверить отображение списка задач", completed: true, priority: "medium" },
  { id: 37, title: "Проверить работу фильтров", completed: true, priority: "low" },
  { id: 41, title: "Проверить сообщения об ошибках", completed: true, priority: "medium" },
  { id: 58, title: "Проверить доступность с клавиатуры", completed: true, priority: "high" },
  { id: 64, title: "Оформить отчёт о проверке интерфейса", completed: false, priority: "low" },
];
