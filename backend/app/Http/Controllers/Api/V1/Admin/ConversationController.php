<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\MessageRequest;
use App\Http\Resources\Admin\ConversationResource;
use App\Models\Conversation;
use App\Models\Order;
use App\Models\User;
use App\Services\Conversations;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;

/** The owner's inbox: every buyer conversation, unread first if asked, with replies emailed to the buyer. */
class ConversationController extends Controller
{
    public function __construct(private Conversations $conversations) {}

    /** ?unread=1&q=(subject, name, email, order number)&customer=&per_page= */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'unread' => ['nullable', 'boolean'], 'q' => ['nullable', 'string', 'max:100'],
            'customer' => ['nullable', 'integer'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $q = Conversation::query()->with(['user:id,first_name,last_name,email,phone', 'order:id,number,status,total,placed_at,customer_note', 'latestMessage'])
            ->orderByDesc('last_message_at')->orderByDesc('id')
            ->when($request->boolean('unread'), fn ($q) => $q->unreadForAdmin())
            ->when($v['customer'] ?? null, fn ($q, $id) => $q->where('user_id', $id));
        if (! empty($v['q'])) {
            $term = trim(ltrim($v['q'], '#'));
            $like = '%'.addcslashes($term, '%_\\').'%';
            $q->where(fn ($w) => $w->where('subject', 'like', $like)
                ->orWhereHas('order', fn ($o) => $o->where('number', $term))
                ->orWhereHas('user', fn ($u) => $u->where('email', 'like', $like)->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like])));
        }

        return ConversationResource::collection($q->paginate($v['per_page'] ?? 20)->withQueryString())->additional(['meta' => [
            'unread' => Conversation::query()->unreadForAdmin()->count(),
            'total' => Conversation::query()->count(),
        ]]);
    }

    /** Opening a conversation marks the buyer's messages as read by the owner. */
    public function show(Conversation $conversation): ConversationResource
    {
        $conversation->load(['user', 'order', 'messages.admin:id,name']);
        $this->conversations->markRead($conversation, 'admin');

        return new ConversationResource($conversation);
    }

    /** The owner writes first: to a buyer, optionally about one of their orders. */
    public function store(MessageRequest $request): JsonResponse
    {
        $buyer = User::find($request->validated('user_id'));
        if (! $buyer) {
            throw ValidationException::withMessages(['user_id' => 'Choose the customer to write to.']);
        }
        $order = $request->validated('order_id') ? Order::find($request->validated('order_id')) : null;
        if ($request->validated('order_id') && ! $order) {
            throw ValidationException::withMessages(['order_id' => 'That order doesn’t exist.']);
        }
        $conversation = $this->conversations->startFromStore($request->user('admin'), $buyer, $order, $request->validated('subject'), $request->validated('body'));

        return (new ConversationResource($conversation->load(['user', 'order', 'messages.admin:id,name'])))->response()->setStatusCode(201);
    }

    public function reply(MessageRequest $request, Conversation $conversation): ConversationResource
    {
        $this->conversations->post($conversation, 'admin', $request->validated('body'), admin: $request->user('admin'));

        return new ConversationResource($conversation->load(['user', 'order', 'messages.admin:id,name']));
    }

    /** Keeps a conversation in the owner's "unread" list to come back to. */
    public function unread(Conversation $conversation): ConversationResource
    {
        $this->conversations->markUnreadForAdmin($conversation);

        return new ConversationResource($conversation->load(['user', 'order']));
    }
}
