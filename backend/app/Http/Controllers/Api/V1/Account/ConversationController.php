<?php

namespace App\Http\Controllers\Api\V1\Account;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\MessageRequest;
use App\Http\Resources\Account\ConversationResource;
use App\Models\Order;
use App\Services\Conversations;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The signed-in buyer's conversations with the store. Every lookup goes through $user->conversations(), so a
 * conversation id that belongs to someone else is simply not found.
 */
class ConversationController extends Controller
{
    public function __construct(private Conversations $conversations) {}

    /** ?order= finds the conversation about one order (if there is one yet). */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate(['order' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:50']]);
        $list = $request->user()->conversations()->with(['order:id,number,status,placed_at', 'latestMessage'])
            ->when($v['order'] ?? null, fn ($q, $id) => $q->where('order_id', $id))
            ->paginate($v['per_page'] ?? 20)->withQueryString();

        return ConversationResource::collection($list)->additional(['meta' => ['unread' => $this->unreadCount($request)]]);
    }

    /** For the account badge (polled while the storefront is open). */
    public function unread(Request $request): JsonResponse
    {
        return response()->json(['unread' => $this->unreadCount($request)]);
    }

    /** Opening a conversation marks the store's messages as read. */
    public function show(Request $request, int $id): ConversationResource
    {
        $conversation = $request->user()->conversations()->with(['order:id,number,status,placed_at', 'messages'])->findOrFail($id);
        $this->conversations->markRead($conversation, 'buyer');

        return new ConversationResource($conversation);
    }

    /** Starts a conversation (about an order of yours, or a general question). One conversation per order. */
    public function store(MessageRequest $request): JsonResponse
    {
        $orderId = $request->validated('order_id');
        $order = $orderId ? Order::where('user_id', $request->user()->id)->find($orderId) : null;
        if ($orderId && ! $order) {
            throw new ApiException(404, 'NOT_FOUND', 'Order not found.');
        }
        $conversation = $this->conversations->start($request->user(), $order, $request->validated('subject'), $request->validated('body'));

        return (new ConversationResource($conversation->load(['order:id,number,status,placed_at', 'messages'])))->response()->setStatusCode(201);
    }

    public function reply(MessageRequest $request, int $id): JsonResponse
    {
        $conversation = $request->user()->conversations()->findOrFail($id);
        $message = $this->conversations->post($conversation, 'buyer', $request->validated('body'), buyer: $request->user());

        return response()->json(['data' => ['id' => $message->id, 'from' => 'you', 'body' => $message->body, 'created_at' => $message->created_at?->toIso8601String()]], 201);
    }

    private function unreadCount(Request $request): int
    {
        return $request->user()->conversations()->unreadForBuyer()->count();
    }
}
