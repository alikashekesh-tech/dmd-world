<?php

namespace App\Http\Controllers\Api\V1\Account;

use App\Http\Controllers\Controller;
use App\Http\Requests\Account\AddressRequest;
use App\Http\Resources\AddressResource;
use App\Models\Address;
use App\Services\AddressBook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * The signed-in buyer's address book. Every address is looked up inside the buyer's own addresses, so another
 * buyer's address id simply isn't found (404): it can't be read, changed or even confirmed to exist.
 */
class AddressController extends Controller
{
    public function __construct(private AddressBook $book) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        return AddressResource::collection($request->user()->addresses()->get());
    }

    public function store(AddressRequest $request): JsonResponse
    {
        return (new AddressResource($this->book->add($request->user(), $request->validated())))->response()->setStatusCode(201);
    }

    public function update(AddressRequest $request, int $id): AddressResource
    {
        return new AddressResource($this->book->update($request->user(), $this->mine($request, $id), $request->validated()));
    }

    public function destroy(Request $request, int $id): Response
    {
        $this->book->remove($request->user(), $this->mine($request, $id));

        return response()->noContent();
    }

    public function makeDefault(Request $request, int $id): AddressResource
    {
        $address = $this->mine($request, $id);
        $this->book->makeDefault($request->user(), $address);

        return new AddressResource($address->refresh());
    }

    private function mine(Request $request, int $id): Address
    {
        return Address::where('user_id', $request->user()->id)->findOrFail($id);
    }
}
