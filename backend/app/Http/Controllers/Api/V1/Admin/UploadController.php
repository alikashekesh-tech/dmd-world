<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Image uploads for products, categories and brands, and product videos. The file's real content decides its type (not its name or
 * the browser's claim); only JPEG, PNG, WebP and GIF are accepted (no SVG: it can carry script). It's stored on the
 * public disk under a random name with the extension of its real type, so nothing uploaded can run or overwrite.
 */
class UploadController extends Controller
{
    private const TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

    // Some MP4 files (by their brand box) are reported as application/mp4; they play the same.
    private const VIDEO_TYPES = ['video/mp4' => 'mp4', 'application/mp4' => 'mp4', 'video/webm' => 'webm'];

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:5120', 'mimetypes:'.implode(',', array_keys(self::TYPES)), 'dimensions:max_width=6000,max_height=6000'],
        ], [
            'file.required' => 'Choose an image to upload.',
            'file.max' => 'Images can be at most 5 MB.',
            'file.mimetypes' => 'Upload a JPEG, PNG, WebP or GIF image.',
            'file.dimensions' => 'Images can be at most 6000 × 6000 pixels.',
        ]);
        $file = $request->file('file');
        $extension = self::TYPES[$file->getMimeType()];
        $path = $file->storeAs('uploads/'.now()->format('Y/m'), Str::uuid().'.'.$extension, 'public');
        Activity::record('upload.created', 'Uploaded an image', null, $request->user('admin'));

        // A same-origin path: Laravel's public/storage in development (through the Vite proxy), the web server in production.
        return response()->json(['data' => ['url' => '/storage/'.$path, 'path' => $path]], 201);
    }

    /** A product video, checked the same way: MP4 or WebM by its real content, at most 30 MB (longer ones go on YouTube). */
    public function video(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:30720'],
        ], [
            'file.required' => 'Choose a video to upload.',
            'file.uploaded' => 'Videos can be at most 30 MB. Put longer ones on YouTube and paste the link.',
            'file.max' => 'Videos can be at most 30 MB. Put longer ones on YouTube and paste the link.',
        ]);
        $file = $request->file('file');
        // The bytes decide, read here directly (never the name or the browser's claim).
        $type = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getPathname());
        $extension = self::VIDEO_TYPES[$type] ?? throw ValidationException::withMessages(['file' => 'Upload an MP4 or WebM video.']);
        $path = $file->storeAs('uploads/'.now()->format('Y/m'), Str::uuid().'.'.$extension, 'public');
        Activity::record('upload.created', 'Uploaded a video', null, $request->user('admin'));

        return response()->json(['data' => ['url' => '/storage/'.$path, 'path' => $path]], 201);
    }
}
