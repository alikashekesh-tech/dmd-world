<?php

namespace App\Support;

final class Secrets
{
    /**
     * A random password with upper and lower case letters, digits and a symbol (so it passes DMD's password policy
     * and MySQL's validate_password), using only characters that are safe unquoted in a .env file.
     */
    public static function password(int $length = 32): string
    {
        $sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '-_'];
        $all = implode('', $sets);
        $chars = array_map(fn (string $set) => $set[random_int(0, strlen($set) - 1)], $sets);
        while (count($chars) < $length) {
            $chars[] = $all[random_int(0, strlen($all) - 1)];
        }
        for ($i = count($chars) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$chars[$i], $chars[$j]] = [$chars[$j], $chars[$i]];
        }

        return implode('', $chars);
    }
}
