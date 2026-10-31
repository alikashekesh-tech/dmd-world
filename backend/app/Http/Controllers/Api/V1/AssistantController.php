<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\Assistant\ShoppingAssistant;
use App\Support\Text;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The shopping assistant: one question in, an answer from the store's own data out. Nothing is stored but counts. */
class AssistantController extends Controller
{
    public function ask(Request $request, ShoppingAssistant $assistant): JsonResponse
    {
        if (! ShoppingAssistant::enabled()) {
            throw new ApiException(404, 'NOT_FOUND', 'The shopping assistant is switched off.');
        }
        // `context` is the previous answer's context, sent back by the browser for follow-ups ("ps5", "cheaper").
        $v = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:300'],
            'context' => ['sometimes', 'nullable', 'array'],
            'context.kinds' => ['sometimes', 'array', 'max:4'],
            'context.platforms' => ['sometimes', 'array', 'max:5'],
            'context.words' => ['sometimes', 'array', 'max:6'],
            'context.words.*' => ['string', 'max:30'],
            'context.min' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000'],
            'context.max' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000'],
            'context.offset' => ['sometimes', 'integer', 'min:0', 'max:200'],
            'context.locale' => ['sometimes', 'in:en,ar'],
        ], [
            'message.required' => 'Ask a question first.', 'message.min' => 'Ask a question first.', 'message.max' => 'Keep your question under 300 characters.',
        ]);

        return response()->json(['data' => $assistant->answer(Text::line($v['message'], 300), $request->input('context') ?? [])]);
    }
}
