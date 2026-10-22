<?php

namespace Tests\Feature\Catalog;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class UploadTest extends TestCase
{
    use RefreshDatabase;

    /** SpaClient sends JSON; uploads are multipart, so they go through the owner's session cookies directly. */
    private function upload(UploadedFile $file, bool $asOwner = true)
    {
        $browser = $asOwner ? $this->owner() : $this->buyer();
        $this->app['auth']->forgetGuards();
        config(['auth.defaults.guard' => 'web']);

        return $this->withHeaders(['Origin' => self::SPA, 'Referer' => self::SPA.'/', 'Accept' => 'application/json'])
            ->withUnencryptedCookies($browser->cookies)
            ->post('/api/v1/admin/uploads', ['file' => $file]);
    }

    public function test_an_image_is_stored_under_a_random_name_with_its_real_type(): void
    {
        Storage::fake('public');

        $response = $this->upload(UploadedFile::fake()->image('../../evil name.png', 800, 600))->assertCreated();

        $path = $response->json('data.path');
        $this->assertMatchesRegularExpression('#^uploads/\d{4}/\d{2}/[0-9a-f-]{36}\.png$#', $path, 'the browser’s file name is never used');
        $this->assertSame('/storage/'.$path, $response->json('data.url'));
        Storage::disk('public')->assertExists($path);
    }

    public function test_svg_scripts_and_disguised_files_are_refused(): void
    {
        Storage::fake('public');

        $svg = UploadedFile::fake()->createWithContent('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        $this->upload($svg)->assertStatus(422)->assertJsonPath('error.fields.file.0', 'Upload a JPEG, PNG, WebP or GIF image.');

        $php = UploadedFile::fake()->createWithContent('shell.png', '<?php system($_GET["c"]); ?>');
        $this->upload($php)->assertStatus(422);

        $huge = UploadedFile::fake()->image('big.jpg')->size(6000);
        $this->upload($huge)->assertStatus(422)->assertJsonPath('error.fields.file.0', 'Images can be at most 5 MB.');

        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_buyers_cannot_upload(): void
    {
        Storage::fake('public');
        $this->upload(UploadedFile::fake()->image('a.png'), asOwner: false)->assertUnauthorized();
        $this->assertSame([], Storage::disk('public')->allFiles());
    }
}
