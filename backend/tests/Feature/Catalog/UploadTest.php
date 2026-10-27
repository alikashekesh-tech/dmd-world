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
    private function upload(UploadedFile $file, bool $asOwner = true, string $path = 'uploads')
    {
        $browser = $asOwner ? $this->owner() : $this->buyer();
        $this->app['auth']->forgetGuards();
        config(['auth.defaults.guard' => 'web']);

        return $this->withHeaders(['Origin' => self::SPA, 'Referer' => self::SPA.'/', 'Accept' => 'application/json'])
            ->withUnencryptedCookies($browser->cookies)
            ->post("/api/v1/admin/{$path}", ['file' => $file]);
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
        $this->upload($this->mp4(), asOwner: false, path: 'uploads/video')->assertUnauthorized();
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_a_video_is_stored_under_a_random_name_with_its_real_type(): void
    {
        Storage::fake('public');

        $path = $this->upload($this->mp4('../holiday clip.mp4'), path: 'uploads/video')->assertCreated()->json('data.path');

        $this->assertMatchesRegularExpression('#^uploads/\d{4}/\d{2}/[0-9a-f-]{36}\.mp4$#', $path, 'the browser’s file name is never used');
        Storage::disk('public')->assertExists($path);
    }

    public function test_only_mp4_and_webm_videos_up_to_30_mb_are_accepted(): void
    {
        Storage::fake('public');

        $this->upload(UploadedFile::fake()->createWithContent('clip.mp4', '<?php system($_GET["c"]); ?>'), path: 'uploads/video')
            ->assertStatus(422)->assertJsonPath('error.fields.file.0', 'Upload an MP4 or WebM video.');
        $this->upload(UploadedFile::fake()->image('photo.jpg'), path: 'uploads/video')->assertStatus(422);
        $this->upload(UploadedFile::fake()->create('long.mp4', 31 * 1024, 'video/mp4'), path: 'uploads/video')
            ->assertStatus(422)->assertJsonPath('error.fields.file.0', 'Videos can be at most 30 MB. Put longer ones on YouTube and paste the link.');

        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    /** The smallest file whose content is an MP4 (an ftyp box), whatever it's called. */
    private function mp4(string $name = 'clip.mp4'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom".str_repeat("\x00", 64));
    }
}
