const studyPlan = [
    { day: "День 1", task: "Изучение синтаксиса JavaScript" },
    { day: "День 2", task: "Работа с массивами и объектами" },
    { day: "День 3", task: "DOM-дерево и события" }
];
studyPlan.forEach(item => {
    console.log(`${item.day}: ${item.task}`);
});