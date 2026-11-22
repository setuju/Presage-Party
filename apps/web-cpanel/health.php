<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

function check_url($url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_NOBODY => true,
        CURLOPT_TIMEOUT => 4,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true
    ]);
    curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return ['url' => $url, 'httpCode' => $code, 'ok' => ($code >= 200 && $code < 500), 'error' => $err ?: null];
}

echo json_encode([
    'service' => 'finchgame.saturumah.net',
    'timestamp' => gmdate('c'),
    'primary' => check_url('https://presage-party.onrender.com'),
    'backup' => check_url('https://presage-party.enzonic.dev')
], JSON_PRETTY_PRINT);
