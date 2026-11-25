<?php
// One-time seeder if database is empty
$dbDir = __DIR__ . '/data';
if (!is_dir($dbDir)) {
    @mkdir($dbDir, 0755, true);
}
$dbPath = $dbDir . '/leaderboard.sqlite';
$db = new PDO('sqlite:' . $dbPath);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$count = $db->query("SELECT COUNT(*) FROM scores")->fetchColumn();
if ($count == 0) {
    $samples = [
        // Level 1: Chill Mode
        ['PixelKing', 1, 'Chill Mode', 980, 'host'],
        ['PresageMaster', 1, 'Chill Mode', 940, 'solo'],
        ['SpectraPro', 1, 'Chill Mode', 890, 'guest'],
        ['ZenMaster', 1, 'Chill Mode', 850, 'solo'],
        ['CyberSamurai', 1, 'Chill Mode', 810, 'guest'],
        
        // Level 2: Seriously?
        ['PixelKing', 2, 'Seriously?', 920, 'host'],
        ['CyberSamurai', 2, 'Seriously?', 900, 'guest'],
        ['SpectraPro', 2, 'Seriously?', 840, 'solo'],
        ['IronNerves', 2, 'Seriously?', 790, 'solo'],
        
        // Level 3: Why So Serious?
        ['PixelKing', 3, 'Why So Serious?', 880, 'host'],
        ['IronNerves', 3, 'Why So Serious?', 860, 'solo'],
        ['StoneFace', 3, 'Why So Serious?', 820, 'guest'],
        ['PresageMaster', 3, 'Why So Serious?', 780, 'solo'],

        // Level 4: Don't Scream
        ['StoneFace', 4, "Don't Scream", 950, 'guest'],
        ['PixelKing', 4, "Don't Scream", 910, 'host'],
        ['PresageMaster', 4, "Don't Scream", 870, 'solo'],
        ['IronNerves', 4, "Don't Scream", 830, 'solo'],
    ];

    $stmt = $db->prepare("INSERT INTO scores (name, mode_id, mode_name, score, role) VALUES (?, ?, ?, ?, ?)");
    foreach ($samples as $s) {
        $stmt->execute($s);
    }
    echo "Seeded " . count($samples) . " scores.\n";
} else {
    echo "Already contains $count scores.\n";
}
