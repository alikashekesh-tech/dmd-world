<?php

namespace Tests\Feature\Catalog;

use App\Models\ProductVariant;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use RuntimeException;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * product_variants.live_options_key exists in two forms: a stored generated column (databases migrated with the first
 * version of the variations migration, such as the development database) and a plain column the model fills (later
 * installs). Saving, editing and removing variations must work on both, and a live combination must still never be
 * sold twice. Regression: saving variations failed with MySQL error 3105 on the generated column.
 */
class ProductVariantLiveKeyTest extends TestCase
{
    use RefreshDatabase {
        beginDatabaseTransaction as private beginTestTransaction;
    }

    private const ADMIN = '/api/v1/admin/products';

    private const GENERATED = 'ALTER TABLE product_variants MODIFY live_options_key CHAR(40) GENERATED ALWAYS AS (IF(`deleted_at` IS NULL, `options_key`, NULL)) STORED NULL';

    private const PLAIN = 'ALTER TABLE product_variants MODIFY live_options_key CHAR(40) NULL';

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /**
     * The generated-column test changes the column before its transaction starts (MySQL commits any open transaction
     * on ALTER TABLE) and changes it back after the rollback, on the testing database only.
     */
    public function beginDatabaseTransaction(): void
    {
        $generated = str_contains($this->name(), 'generated');
        if ($generated) {
            $this->schema(self::GENERATED);
        }
        $this->beginTestTransaction(); // registers the rollback first, so it runs before the column is changed back
        if ($generated) {
            $this->beforeApplicationDestroyed(fn () => $this->schema(self::PLAIN));
        }
    }

    private function schema(string $sql): void
    {
        if (DB::connection()->getDatabaseName() !== 'dmd_world_testing') {
            throw new RuntimeException('Schema changes are only made on dmd_world_testing.');
        }
        DB::statement($sql);
        ProductVariant::forgetLiveKeyColumn();
    }

    private function headset(SpaClient $owner): array
    {
        return $owner->post(self::ADMIN, [
            'name' => 'Marvo HG9015 Headset', 'status' => 'published', 'type' => 'variable',
            'attributes' => [['name' => 'Colour', 'values' => ['Black', 'White', 'Red']]],
            'variants' => [
                ['options' => ['Colour' => 'Black'], 'sku' => 'HG-BK', 'regular_price' => 25, 'stock_quantity' => 5],
                ['options' => ['Colour' => 'White'], 'sku' => 'HG-WH', 'regular_price' => 25, 'stock_quantity' => 0],
                ['options' => ['Colour' => 'Red'], 'sku' => 'HG-RD', 'regular_price' => 27, 'sale_price' => 22, 'stock_quantity' => 2],
            ],
        ])->assertCreated()->json('data');
    }

    /** Colour => [stock, regular price, active] for the product's variants, as the admin reads them back. */
    private function reload(SpaClient $owner, int $id): array
    {
        return collect($owner->get(self::ADMIN."/{$id}")->assertOk()->json('data.variants'))
            ->mapWithKeys(fn ($v) => [$v['options']['Colour'] => [$v['stock_quantity'], $v['regular_price'], $v['is_active']]])->sortKeys()->all();
    }

    private function row(array $variant, array $change = []): array
    {
        return array_merge(['id' => $variant['id'], 'options' => $variant['options'], 'sku' => $variant['sku'], 'regular_price' => $variant['regular_price'],
            'sale_price' => $variant['sale_price'] ?? null, 'stock_quantity' => $variant['stock_quantity'], 'is_active' => $variant['is_active']], $change);
    }

    private function colour(array $product, string $colour): array
    {
        return collect($product['variants'])->first(fn ($v) => $v['options']['Colour'] === $colour);
    }

    /** Every live variant's key in the database equals its combination's key; every removed one's is empty. */
    private function assertLiveKeys(int $productId, int $live): void
    {
        $rows = DB::table('product_variants')->where('product_id', $productId)->get(['options_key', 'live_options_key', 'deleted_at']);
        $this->assertCount($live, $rows->whereNull('deleted_at'));
        foreach ($rows as $r) {
            $this->assertSame($r->deleted_at === null ? $r->options_key : null, $r->live_options_key);
        }
    }

    private function createsEditsAndProtects(): void
    {
        $owner = $this->owner();
        $p = $this->headset($owner);
        $this->assertSame(['Black' => [5, 25, true], 'Red' => [2, 27, true], 'White' => [0, 25, true]], $this->reload($owner, $p['id']), 'saved, including stock 0');
        $this->assertLiveKeys($p['id'], 3);

        // Edit: a new price and stock, Red down to 0, White removed, Blue added at 0.
        $edited = $owner->put(self::ADMIN."/{$p['id']}", [
            'attributes' => [['name' => 'Colour', 'values' => ['Black', 'Red', 'Blue']]],
            'variants' => [
                $this->row($this->colour($p, 'Black'), ['regular_price' => 30, 'stock_quantity' => 3]),
                $this->row($this->colour($p, 'Red'), ['stock_quantity' => 0]),
                ['options' => ['Colour' => 'Blue'], 'sku' => 'HG-BL', 'regular_price' => 26, 'stock_quantity' => 0],
            ],
        ])->assertOk()->json('data');
        $this->assertSame(['Black' => [3, 30, true], 'Blue' => [0, 26, true], 'Red' => [0, 27, true]], $this->reload($owner, $p['id']), 'the edit persists after reloading');
        $this->assertSoftDeleted('product_variants', ['id' => $this->colour($p, 'White')['id']]);
        $this->assertLiveKeys($p['id'], 3);

        // Two live variants with the same combination: refused, nothing changes.
        $owner->put(self::ADMIN."/{$p['id']}", [
            'attributes' => $edited['attributes'],
            'variants' => [$this->row($this->colour($edited, 'Black')), ['options' => ['colour' => ' black '], 'regular_price' => 31]],
        ])->assertStatus(422)->assertJsonPath('error.code', 'DUPLICATE_VARIANT');
        $this->assertSame(['Black' => [3, 30, true], 'Blue' => [0, 26, true], 'Red' => [0, 27, true]], $this->reload($owner, $p['id']));

        // The database itself still refuses a second live row for a combination.
        $black = ProductVariant::findOrFail($this->colour($edited, 'Black')['id']);
        $copy = ['product_id' => $p['id'], 'options' => json_encode(['Colour' => 'Black']), 'options_key' => $black->options_key, 'regular_price' => 30, 'created_at' => now(), 'updated_at' => now()];
        if (! ProductVariant::liveKeyIsGenerated()) {
            $copy['live_options_key'] = $black->options_key;
        }
        try {
            DB::table('product_variants')->insert($copy);
            $this->fail('A duplicate live combination was stored.');
        } catch (QueryException $e) {
            $this->assertSame(1062, $e->errorInfo[1] ?? null, $e->getMessage());
        }

        // A removed combination can be sold again.
        $owner->put(self::ADMIN."/{$p['id']}", [
            'attributes' => [['name' => 'Colour', 'values' => ['Black', 'Red', 'Blue', 'White']]],
            'variants' => [...array_map(fn ($v) => $this->row($v), $edited['variants']), ['options' => ['Colour' => 'White'], 'regular_price' => 25, 'stock_quantity' => 0]],
        ])->assertOk();
        $this->assertSame(['Black' => [3, 30, true], 'Blue' => [0, 26, true], 'Red' => [0, 27, true], 'White' => [0, 25, true]], $this->reload($owner, $p['id']));
        $this->assertLiveKeys($p['id'], 4);
    }

    public function test_variations_save_when_the_database_computes_the_live_key_generated_column(): void
    {
        $this->assertTrue(ProductVariant::liveKeyIsGenerated(), 'the column is generated for this test');
        $this->createsEditsAndProtects();
    }

    public function test_variations_save_when_the_model_fills_the_live_key_plain_column(): void
    {
        $this->assertFalse(ProductVariant::liveKeyIsGenerated(), 'the column is plain for this test');
        $this->createsEditsAndProtects();
    }
}
