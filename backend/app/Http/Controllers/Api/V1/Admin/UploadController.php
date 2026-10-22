<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Image uploads for products, categories and brands. The file's real content decides its type (not its name or
 * the browser's claim); only JPEG, PNG, WebP and GIF are accepted (no SVG: it can carry script). It's stored on the
 * public disk under a random name with the extension of its real type, so nothing uploaded can run or overwrite.
 */
class UploadController extends Controller
{
    private const TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

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
}
