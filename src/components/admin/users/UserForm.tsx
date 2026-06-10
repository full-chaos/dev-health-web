import type { SyntheticEvent } from "react";
import type { UserCreate, User } from "@/lib/admin/types";
import { BaseForm, inputClass, useBaseFormState } from "@/components/shared/BaseForm";

export type UserFormData = UserCreate & { is_active?: boolean };

type UserFormProps = {
    initialData?: User;
    onSubmit: (data: UserFormData) => Promise<void>;
    onCancel: () => void;
    isEdit?: boolean;
    isLoading?: boolean;
};

export function UserForm({
    initialData,
    onSubmit,
    onCancel,
    isEdit = false,
    isLoading = false,
}: UserFormProps) {
    const { formData, handleChange } = useBaseFormState<UserFormData>({
        email: initialData?.email || "",
        full_name: initialData?.full_name || "",
        username: initialData?.username || "",
        password: "",
        is_active: initialData?.is_active ?? true,
    });

    const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
        await onSubmit(formData);
    };

    return (
        <BaseForm
            onSubmitAction={handleSubmit}
            onCancelAction={onCancel}
            isLoading={isLoading}
            submitLabel={isLoading ? "Saving..." : isEdit ? "Save Changes" : "Create User"}
            className="space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6"
            contentClassName="grid gap-6 md:grid-cols-2"
            actionsClassName="flex justify-end gap-3 pt-4"
        >
            <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-(--ink-muted)">
                    Email *
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={isEdit || isLoading}
                    className={`${inputClass} ${isEdit ? "cursor-not-allowed opacity-50" : ""}`}
                    placeholder="john@example.com"
                    required
                />
            </div>

            <div className="space-y-2">
                <label htmlFor="full_name" className="text-sm font-medium text-(--ink-muted)">
                    Full Name
                </label>
                <input
                    id="full_name"
                    name="full_name"
                    type="text"
                    value={formData.full_name || ""}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={inputClass}
                    placeholder="John Doe"
                />
            </div>

            <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-(--ink-muted)">
                    Username
                </label>
                <input
                    id="username"
                    name="username"
                    type="text"
                    value={formData.username || ""}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={inputClass}
                    placeholder="johndoe"
                />
            </div>

            {!isEdit && (
                <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium text-(--ink-muted)">
                        Password
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        value={formData.password || ""}
                        onChange={handleChange}
                        disabled={isLoading}
                        className={inputClass}
                        placeholder="........"
                        minLength={8}
                    />
                    <p className="text-xs text-(--ink-muted)">
                        Leave blank to send invitation email instead
                    </p>
                </div>
            )}

            {isEdit && (
                <div className="space-y-2">
                    <label htmlFor="is_active" className="text-sm font-medium text-(--ink-muted)">
                        Status
                    </label>
                    <div className="flex items-center gap-2 pt-2">
                        <input
                            id="is_active"
                            name="is_active"
                            type="checkbox"
                            checked={formData.is_active}
                            onChange={handleChange}
                            disabled={isLoading}
                            className="h-4 w-4 rounded border-(--card-stroke) text-(--accent) focus:ring-(--accent)"
                        />
                        <label htmlFor="is_active" className="text-sm text-foreground">
                            Active
                        </label>
                    </div>
                </div>
            )}
        </BaseForm>
    );
}
