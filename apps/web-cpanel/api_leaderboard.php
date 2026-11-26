<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($requestMethod === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dbDir = __DIR__ . '/data';
if (!is_dir($dbDir)) {
    @mkdir($dbDir, 0755, true);
}

$dbPath = $dbDir . '/leaderboard.sqlite';

try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $db->exec("CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        mode_id INTEGER NOT NULL,
        mode_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        role TEXT DEFAULT 'solo',
        ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_mode_score ON scores(mode_id, score DESC)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_name_score ON scores(name, score DESC)");

    // Ensure 'ip' column exists even if table was created in an older version
    try {
        $cols = $db->query("PRAGMA table_info(scores)")->fetchAll(PDO::FETCH_ASSOC);
        $hasIp = false;
        foreach ($cols as $c) {
            if (isset($c['name']) && $c['name'] === 'ip') {
                $hasIp = true;
                break;
            }
        }
        if (!$hasIp) {
            $db->exec("ALTER TABLE scores ADD COLUMN ip TEXT");
        }
    } catch (Exception $e) {}
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error']);
    exit;
}

$action = $_GET['action'] ?? ($requestMethod === 'POST' ? 'submit' : 'get');

if ($action === 'submit' && $requestMethod === 'POST') {
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    // Rate limiting: maximum 30 submissions per minute per IP
    try {
        $rateStmt = $db->prepare("SELECT COUNT(*) FROM scores WHERE ip = :ip AND created_at > datetime('now', '-1 minute')");
        $rateStmt->execute([':ip' => $clientIp]);
        $recentCount = (int)$rateStmt->fetchColumn();
        if ($recentCount > 30) {
            http_response_code(429);
            echo json_encode(['error' => 'Rate limit exceeded. Please wait a moment.']);
            exit;
        }
    } catch (Exception $e) {}

    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data && !empty($_POST)) {
        $data = $_POST;
    }

    $rawName = trim($data['name'] ?? 'Player');
    // Strip control characters and HTML tags
    $name = strip_tags($rawName);
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name);
    if ($name === '') $name = 'Player';
    $name = mb_substr($name, 0, 24);

    $modeId = isset($data['modeId']) ? (int)$data['modeId'] : 1;
    if ($modeId < 1 || $modeId > 4) $modeId = 1;

    $modeNames = [
        1 => 'Chill Mode',
        2 => 'Seriously?',
        3 => 'Why So Serious?',
        4 => "Don't Scream"
    ];
    $modeName = $modeNames[$modeId] ?? 'Chill Mode';

    $score = isset($data['score']) ? (int)$data['score'] : 0;
    if ($score < 0) $score = 0;
    if ($score > 1000) $score = 1000;

    $rawRole = trim($data['role'] ?? 'solo');
    $role = in_array($rawRole, ['host', 'guest', 'solo'], true) ? $rawRole : 'solo';

    // Check if player already has an entry for this mode
    $checkStmt = $db->prepare("SELECT id, score FROM scores WHERE name = :name AND mode_id = :mode_id");
    $checkStmt->execute([':name' => $name, ':mode_id' => $modeId]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        if ($score >= $existing['score']) {
            $updateStmt = $db->prepare("UPDATE scores SET score = :score, role = :role, ip = :ip, created_at = CURRENT_TIMESTAMP WHERE id = :id");
            $updateStmt->execute([':score' => $score, ':role' => $role, ':ip' => $clientIp, ':id' => $existing['id']]);
        }
    } else {
        $insertStmt = $db->prepare("INSERT INTO scores (name, mode_id, mode_name, score, role, ip) VALUES (:name, :mode_id, :mode_name, :score, :role, :ip)");
        $insertStmt->execute([
            ':name' => $name,
            ':mode_id' => $modeId,
            ':mode_name' => $modeName,
            ':score' => $score,
            ':role' => $role,
            ':ip' => $clientIp
        ]);
    }

    echo json_encode(['ok' => true]);
    exit;
}

// Fetch leaderboards
try {
    $modes = [1, 2, 3, 4];
    $modeBoards = [];

    foreach ($modes as $m) {
        $stmt = $db->prepare("SELECT name, score, role, mode_name, created_at FROM scores WHERE mode_id = :mode_id ORDER BY score DESC, created_at ASC LIMIT 50");
        $stmt->execute([':mode_id' => $m]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Sanitize string output
        foreach ($rows as &$r) {
            $r['name'] = htmlspecialchars($r['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $r['mode_name'] = htmlspecialchars($r['mode_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $r['role'] = htmlspecialchars($r['role'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        }
        $modeBoards[$m] = $rows;
    }

    $totStmt = $db->query("SELECT name, 
                                  SUM(score) as total_score, 
                                  COUNT(id) as modes_beaten, 
                                  MAX(score) as best_score, 
                                  MAX(created_at) as last_played
                           FROM scores 
                           GROUP BY name 
                           ORDER BY total_score DESC, modes_beaten DESC 
                           LIMIT 50");
    $totalBoard = $totStmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($totalBoard as &$tr) {
        $tr['name'] = htmlspecialchars($tr['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    echo json_encode([
        'ok' => true,
        'mode_1' => $modeBoards[1],
        'mode_2' => $modeBoards[2],
        'mode_3' => $modeBoards[3],
        'mode_4' => $modeBoards[4],
        'total' => $totalBoard,
        'timestamp' => date('c')
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Query error']);
}
