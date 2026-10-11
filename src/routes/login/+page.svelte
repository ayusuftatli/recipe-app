<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Log in · Recipe Box</title></svelte:head>

<div class="login">
	<h1>Recipe Box</h1>
	<form
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<label for="password">Password</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input id="password" name="password" type="password" autocomplete="current-password" required autofocus />
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button class="btn primary" type="submit" disabled={busy}>Log in</button>
	</form>
</div>

<style>
	.login {
		max-width: 340px;
		margin: 20vh auto 0;
	}
	form {
		display: grid;
		gap: 10px;
	}
</style>
