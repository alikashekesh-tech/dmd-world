<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminResource;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\User;
use App\Rules\StrongPassword;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * The owner's staff accounts (owner only, see routes/admin.php). The owner gives each one a first password and passes
 * it on in person; staff change it themselves in Settings. Removing someone, or setting a new password for them,
 * signs them out everywhere at once.
 */
class StaffController extends Controller
{
    /** Everyone who can sign in to the admin: the owner first, then staff by name. */
    public function index(): AnonymousResourceCollection
    {
        return AdminResource::collection(Admin::query()->orderByRaw('singleton IS NULL')->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $request->merge(['email' => User::normalizeEmail((string) $request->input('email'))]);
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:80', 'not_regex:/[<>]/'],
            'email' => ['required', 'string', 'email:rfc', 'max:254', Rule::unique('admins', 'email')],
            'password' => ['required', 'string', new StrongPassword],
        ], [
            'email.unique' => 'Someone in the admin already uses this email.',
            'name.not_regex' => 'Leave out < and > in the name.',
        ]);

        $staff = new Admin(['name' => trim($data['name']), 'email' => $data['email'], 'password' => $data['password']]);
        $staff->forceFill(['singleton' => null])->save();
        Activity::record('staff.created', "Added {$staff->name} ({$staff->email}) to the staff", null, $request->user('admin'));

        return (new AdminResource($staff))->response()->setStatusCode(201);
    }

    /** A new password for a member of staff (forgotten, or someone else saw it). Their other sessions end. */
    public function password(Request $request, Admin $staff): AdminResource
    {
        $this->ensureStaff($staff);
        $data = $request->validate(['password' => ['required', 'string', new StrongPassword]]);
        $staff->forceFill(['password' => $data['password'], 'remember_token' => Str::random(60)])->save();
        Activity::record('staff.password', "Set a new password for {$staff->name}", null, $request->user('admin'));

        return new AdminResource($staff);
    }

    public function destroy(Request $request, Admin $staff): Response
    {
        $this->ensureStaff($staff);
        // What they did stays in the activity log and on orders, without their name (the links are set to NULL).
        $staff->delete();
        Activity::record('staff.removed', "Removed {$staff->name} ({$staff->email}) from the staff", null, $request->user('admin'));

        return response()->noContent();
    }

    private function ensureStaff(Admin $staff): void
    {
        if ($staff->isOwner()) {
            throw new ApiException(422, 'OWNER_ACCOUNT', 'The owner’s own account is changed in Settings, not here.');
        }
    }
}
