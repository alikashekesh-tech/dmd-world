<?php

namespace App\Http\Requests\Checkout;

use App\Models\Order;
use App\Models\User;
use Illuminate\Validation\Rule;

/**
 * Placing an order. The browser sends what to buy, who to contact and where to deliver; it never sends a price,
 * a total or a buyer id (the session says who is buying, and the server prices everything).
 */
class PlaceOrderRequest extends QuoteRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        $contact = $this->input('contact');
        if (is_array($contact) && isset($contact['email'])) {
            $contact['email'] = User::normalizeEmail($contact['email']);
            $this->merge(['contact' => $contact]);
        }
    }

    public function rules(): array
    {
        $delivery = $this->input('delivery_method') === 'delivery';
        $typed = $delivery && ! $this->filled('address_id');
        $text = fn (int $max) => ['nullable', 'string', 'max:'.$max, 'not_regex:/[<>]/'];

        return parent::rules() + [
            'idempotency_key' => ['required', 'string', 'regex:/^[A-Za-z0-9_-]{16,64}$/'],
            'contact' => ['required', 'array'],
            'contact.first_name' => array_merge(['required'], array_slice(self::nameRules(), 1)),
            'contact.last_name' => array_merge(['required'], array_slice(self::nameRules(), 1)),
            'contact.email' => ['required', 'string', 'email:rfc', 'max:254'],
            'contact.phone' => self::phoneRules(true),
            'delivery_method' => ['required', Rule::in(array_keys(Order::DELIVERY_METHODS))],
            'payment_method' => ['required', Rule::in(array_keys(Order::PAYMENT_METHODS))],
            'address_id' => ['nullable', 'integer', 'min:1'],
            'address' => [$typed ? 'required' : 'nullable', 'array'],
            'address.country' => ['nullable', 'string', 'regex:/^[A-Za-z]{2}$/'],
            'address.city' => [$typed ? 'required' : 'nullable', 'string', 'max:80', 'not_regex:/[<>]/'],
            'address.street' => [$typed ? 'required' : 'nullable', 'string', 'max:160', 'not_regex:/[<>]/'],
            'address.area' => $text(80),
            'address.building' => $text(80),
            'address.floor' => $text(20),
            'address.notes' => $text(300),
            'save_address' => ['sometimes', 'boolean'],
            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'contact.first_name.required' => 'Enter your first name.',
            'contact.last_name.required' => 'Enter your last name.',
            'contact.email.required' => 'Enter a valid email address.',
            'contact.email.email' => 'Enter a valid email address.',
            'contact.phone.required' => 'Enter a phone number DMD can call.',
            'contact.phone.regex' => 'Enter a phone number DMD can call.',
            'address.city.required' => 'Enter your city.',
            'address.street.required' => 'Enter your street address.',
            'idempotency_key.required' => 'Please refresh the page and try again.',
            'idempotency_key.regex' => 'Please refresh the page and try again.',
        ] + parent::messages();
    }
}
