<?php

namespace Tests\Unit;

use App\Console\Commands\ProvisionDatabase;
use PHPUnit\Framework\TestCase;

class DatabasePasswordTest extends TestCase
{
    public function test_generated_database_passwords_are_long_mixed_and_env_safe(): void
    {
        $seen = [];
        foreach (range(1, 20) as $i) {
            $p = ProvisionDatabase::generatePassword();
            $this->assertSame(32, strlen($p));
            $this->assertMatchesRegularExpression('/[A-Z]/', $p);
            $this->assertMatchesRegularExpression('/[a-z]/', $p);
            $this->assertMatchesRegularExpression('/\d/', $p);
            $this->assertMatchesRegularExpression('/[-_]/', $p);
            $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]+$/', $p, 'safe to write into .env unquoted');
            $seen[$p] = true;
        }
        $this->assertCount(20, $seen);
    }
}
