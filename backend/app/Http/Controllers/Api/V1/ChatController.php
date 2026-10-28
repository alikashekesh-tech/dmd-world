<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\MessageRequest;
use App\Models\Conversation;
use App\Models\Message;
use App\Services\Conversations;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The live chat bubble on the storefront. Anyone can chat: a signed-in buyer as themselves, a guest with a name (and
 * an optional email) and a private key their browser keeps and sends as X-Chat-Token. The bubble asks for new
 * messages every few seconds while open; the owner and staff answer from Admin › Messages.
 */
class ChatController extends Controller
{
    public function __construct(private Conversations $conversations) {}

    /** ?after=<last message id the bubble has>&read=1 (the bubble is open, so the store's replies are seen). */
    public function show(Request $request): JsonResponse
    {
        $v = $request->validate(['after' => ['nullable', 'integer', 'min:0'], 'read' => ['nullable', 'boolean']]);
        $chat = $this->conversations->chatFor($request->user(), $request->header('X-Chat-Token'));
        if ($chat && $request->boolean('read')) {
            $this->conversations->markRead($chat, 'buyer');
        }

        return $this->answer($chat, (int) ($v['after'] ?? 0));
    }

    /** A message from the visitor; the first one starts the chat (a guest says who they are then). */
    public function send(MessageRequest $request): JsonResponse
    {
        $buyer = $request->user();
        $chat = $this->conversations->chatFor($buyer, $request->header('X-Chat-Token'));
        $after = (int) $request->input('after', 0);
        if ($chat) {
            $this->conversations->post($chat, 'buyer', $request->validated('body'), buyer: $buyer);

            return $this->answer($chat->refresh(), $after);
        }

        $guest = $request->validate([
            'name' => [$buyer ? 'nullable' : 'required', 'string', 'min:2', 'max:80', 'not_regex:/[<>]/'],
            'email' => ['nullable', 'string', 'email:rfc', 'max:254'],
        ], ['name.required' => 'Tell us your name so we know who we’re talking to.', 'name.not_regex' => 'Leave out < and > in your name.']);
        if (! $buyer && trim((string) ($guest['name'] ?? '')) === '') {
            throw ValidationException::withMessages(['name' => 'Tell us your name so we know who we’re talking to.']);
        }
        $started = $this->conversations->startChat($buyer, $buyer ? null : trim($guest['name']), $guest['email'] ?? null, $request->validated('body'));

        return $this->answer($started['conversation'], 0, $started['token'])->setStatusCode(201);
    }

    private function answer(?Conversation $chat, int $after, ?string $token = null): JsonResponse
    {
        $messages = $chat ? $chat->messages()->where('id', '>', $after)->with('admin:id,name')->get() : collect();

        return response()->json(['data' => [
            'started' => $chat !== null,
            'name' => $chat?->customerName(),
            'unread' => $chat?->unreadForBuyer() ?? false,
            'messages' => $messages->map(fn (Message $m) => [
                'id' => $m->id, 'from' => $m->sender_type === 'buyer' ? 'you' : 'store',
                'by' => $m->sender_type === 'admin' ? $m->admin?->name : null,
                'body' => $m->body, 'at' => $m->created_at?->toIso8601String(),
            ])->values(),
        ], 'meta' => array_filter(['token' => $token])]); // the guest's key, only in the reply that created the chat
    }
}
